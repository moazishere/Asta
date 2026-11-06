import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import request from 'supertest';

import { macrosForGrams, scaleMacros, sumTotals } from '../src/lib/nutrition.js';
import { loadSeedFoods, seedFoods } from '../src/seed/foods.js';
import { createTestApp } from './helpers.js';

const { app, db, pg } = await createTestApp();
const api = () => request(app);
const seedData = loadSeedFoods();
await db.asService((q) => seedFoods(q, seedData));

type Tokens = { accessToken: string; user: { id: string } };
let counter = 0;
const bearer = (t: Tokens) => ({ Authorization: `Bearer ${t.accessToken}` });
async function newUser(goal?: number): Promise<Tokens> {
  const res = await api()
    .post('/auth/register')
    .send({ email: `food${++counter}@example.com`, password: 'password123' });
  const t = res.body as Tokens;
  if (goal) await api().patch('/me/profile').set(bearer(t)).send({ daily_kcal_goal: goal });
  return t;
}
const DAY = '2026-11-05';

async function search(t: Tokens, q: string, limit?: number) {
  const res = await api()
    .get('/foods')
    .query({ q, ...(limit ? { limit } : {}) })
    .set(bearer(t));
  assert.equal(res.status, 200);
  return res.body.items as { id: string; name: string; name_ar: string | null; mine: boolean }[];
}
async function foodId(t: Tokens, name: string) {
  const hit = (await search(t, name)).find((f) => f.name === name);
  assert.ok(hit, `seed food "${name}" not found`);
  return hit.id;
}
const logFood = (t: Tokens, body: object) => api().post('/food-logs').set(bearer(t)).send(body);

describe('nutrition maths', () => {
  const hummus = { kcal_per_100g: 166, protein_g: 8, carbs_g: 14, fat_g: 10 };
  it('scales a food to grams: whole kcal, 0.1 g macros', () => {
    assert.deepEqual(macrosForGrams(hummus, 60), {
      kcal: 100,
      protein_g: 4.8,
      carbs_g: 8.4,
      fat_g: 6,
    });
    assert.deepEqual(macrosForGrams(hummus, 100), {
      kcal: 166,
      protein_g: 8,
      carbs_g: 14,
      fat_g: 10,
    });
    assert.equal(macrosForGrams(hummus, 0.5).kcal, 1);
  });
  it('rescales a stored snapshot without re-reading the food', () => {
    const m = scaleMacros({ kcal: 100, protein_g: 4.8, carbs_g: 8.4, fat_g: 6 }, 2);
    assert.deepEqual(m, { kcal: 200, protein_g: 9.6, carbs_g: 16.8, fat_g: 12 });
  });
  it('totals are exact sums of the stored values', () => {
    const t = sumTotals([
      { kcal: 101, protein_g: 0.1, carbs_g: 0.2, fat_g: 0.3 },
      { kcal: 202, protein_g: 0.2, carbs_g: 0.1, fat_g: 0.4 },
    ]);
    assert.deepEqual(t, { kcal: 303, protein_g: 0.3, carbs_g: 0.3, fat_g: 0.7 });
    assert.deepEqual(sumTotals([]), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('starter foods', () => {
  it('has about 50 valid foods including the Levantine staples', () => {
    assert.ok(seedData.length >= 50);
    const names = seedData.map((f) => f.name.toLowerCase());
    for (const needle of [
      'hummus',
      'falafel',
      'shawarma',
      'manakish',
      'tabbouleh',
      'fattoush',
      'kibbeh',
      'mujaddara',
      'labneh',
      "za'atar bread",
      'rice with chicken',
    ]) {
      assert.ok(
        names.some((n) => n.includes(needle)),
        `missing ${needle}`,
      );
    }
  });
  it('energy roughly matches the macros (catches typos in the data file)', () => {
    for (const f of seedData) {
      const atwater = 4 * f.protein_g + 4 * f.carbs_g + 9 * f.fat_g;
      const tolerance = Math.max(40, 0.25 * f.kcal_per_100g);
      assert.ok(
        Math.abs(atwater - f.kcal_per_100g) <= tolerance,
        `${f.name}: ${f.kcal_per_100g} kcal vs ${atwater} from macros`,
      );
      assert.ok(f.protein_g + f.carbs_g + f.fat_g <= 100.5, `${f.name}: macros exceed 100 g`);
      assert.ok(f.name_ar, `${f.name}: missing Arabic name`);
    }
  });
  it('seeding is idempotent and updates values by name without duplicating', async () => {
    const count = async () =>
      (await pg.query<{ n: number }>(`select count(*)::int n from foods where source = 'custom'`))
        .rows[0]!.n;
    const before = await count();
    assert.equal(before, seedData.length);
    const edited = seedData.map((f) => (f.name === 'Hummus' ? { ...f, kcal_per_100g: 170 } : f));
    await db.asService((q) => seedFoods(q, edited));
    assert.equal(await count(), before);
    const row = await pg.query<{ kcal_per_100g: number }>(
      `select kcal_per_100g from foods where name = 'Hummus'`,
    );
    assert.equal(row.rows[0]!.kcal_per_100g, 170);
    await db.asService((q) => seedFoods(q, seedData)); // restore for the other tests
  });
});

describe('GET /foods (search)', () => {
  it('finds foods by English name, case-insensitively', async () => {
    const t = await newUser();
    const names = (await search(t, 'HUMMUS')).map((f) => f.name);
    assert.ok(names.includes('Hummus'));
  });
  it('finds foods by Arabic name', async () => {
    const t = await newUser();
    assert.ok((await search(t, 'فلافل')).some((f) => f.name === 'Falafel'));
    assert.ok((await search(t, 'حمص')).some((f) => f.name === 'Hummus'));
  });
  it('lists prefix matches before partial matches', async () => {
    const t = await newUser();
    const names = (await search(t, 'rice')).map((f) => f.name);
    assert.ok(names.length >= 2);
    assert.ok(names[0]!.toLowerCase().startsWith('rice'), names.join(', '));
  });
  it('treats % and _ literally and respects the limit', async () => {
    const t = await newUser();
    assert.deepEqual(await search(t, '%'), []);
    assert.deepEqual(await search(t, '_'), []);
    assert.equal((await search(t, '', 5)).length, 5);
    assert.equal((await search(t, 'zzzzqqq')).length, 0);
  });
  it('requires login', async () => {
    assert.equal((await api().get('/foods')).status, 401);
  });
});

describe('custom foods', () => {
  const body = {
    name: "Mom's kibbeh",
    name_ar: 'كبة أمي',
    kcal_per_100g: 220,
    protein_g: 12,
    carbs_g: 18,
    fat_g: 11,
    serving_g: 80,
  };

  it('creates a food owned by me and shows it in my search', async () => {
    const t = await newUser();
    const res = await api().post('/foods').set(bearer(t)).send(body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.source, 'user');
    assert.equal(res.body.mine, true);
    assert.ok((await search(t, "mom's")).some((f) => f.id === res.body.id && f.mine));
  });

  it('keeps custom foods private: other users cannot see, fetch or log them', async () => {
    const owner = await newUser();
    const other = await newUser();
    const created = (
      await api()
        .post('/foods')
        .set(bearer(owner))
        .send({ ...body, name: 'Secret recipe' })
    ).body;
    assert.deepEqual(await search(other, 'secret'), []);
    assert.equal((await api().get(`/foods/${created.id}`).set(bearer(other))).status, 404);
    const res = await logFood(other, {
      food_id: created.id,
      grams: 100,
      meal_type: 'lunch',
      log_date: DAY,
    });
    assert.equal(res.status, 404);
  });

  it('rejects duplicates per user but lets two users share a name', async () => {
    const a = await newUser();
    const b = await newUser();
    assert.equal(
      (
        await api()
          .post('/foods')
          .set(bearer(a))
          .send({ ...body, name: 'Same name' })
      ).status,
      201,
    );
    const dup = await api()
      .post('/foods')
      .set(bearer(a))
      .send({ ...body, name: 'same NAME' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'food_exists');
    assert.equal(
      (
        await api()
          .post('/foods')
          .set(bearer(b))
          .send({ ...body, name: 'Same name' })
      ).status,
      201,
    );
  });

  it('cannot clash with or overwrite a shared starter food', async () => {
    const t = await newUser();
    // Same name as a shared food is allowed (separate namespace) but never changes the shared one.
    await api()
      .post('/foods')
      .set(bearer(t))
      .send({ ...body, name: 'Hummus', kcal_per_100g: 1 });
    const shared = await pg.query<{ kcal_per_100g: number }>(
      `select kcal_per_100g from foods where name = 'Hummus' and source = 'custom'`,
    );
    assert.equal(shared.rows[0]!.kcal_per_100g, 166);
  });

  it('validates the numbers and refuses fields a client may not set', async () => {
    const t = await newUser();
    const post = (b: object) => api().post('/foods').set(bearer(t)).send(b);
    assert.equal((await post({ ...body, name: '' })).status, 400);
    assert.equal((await post({ ...body, kcal_per_100g: -5 })).status, 400);
    assert.equal((await post({ ...body, kcal_per_100g: 5000 })).status, 400);
    assert.equal(
      (await post({ ...body, protein_g: 70, carbs_g: 30, fat_g: 20 })).status,
      400,
      'macros exceed 100 g',
    );
    assert.equal(
      (await post({ ...body, source: 'custom' })).status,
      400,
      'cannot create shared foods',
    );
    assert.equal((await post({ ...body, created_by: randomUUID() })).status, 400);
    assert.equal(
      (await post({ name: 'Minimal', kcal_per_100g: 10 })).status,
      201,
      'macros default to 0',
    );
  });
});

describe('food log', () => {
  it('logs a food: the server computes the macros snapshot from the grams', async () => {
    const t = await newUser();
    const id = await foodId(t, 'Hummus');
    const res = await logFood(t, { food_id: id, grams: 60, meal_type: 'lunch', log_date: DAY });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.name, 'Hummus');
    assert.equal(res.body.name_ar, 'حمص');
    assert.equal(res.body.grams, 60);
    assert.deepEqual(
      {
        kcal: res.body.kcal,
        protein_g: res.body.protein_g,
        carbs_g: res.body.carbs_g,
        fat_g: res.body.fat_g,
      },
      { kcal: 100, protein_g: 4.8, carbs_g: 8.4, fat_g: 6 },
    );
    assert.equal(res.body.log_date, DAY);
  });

  it('refuses client-supplied macros and bad input', async () => {
    const t = await newUser();
    const id = await foodId(t, 'Hummus');
    const ok = { food_id: id, grams: 60, meal_type: 'lunch', log_date: DAY };
    assert.equal(
      (await logFood(t, { ...ok, kcal: 1 })).status,
      400,
      'kcal must not be accepted with a food',
    );
    assert.equal((await logFood(t, { ...ok, grams: 0 })).status, 400);
    assert.equal((await logFood(t, { ...ok, grams: 9000 })).status, 400);
    assert.equal((await logFood(t, { ...ok, meal_type: 'brunch' })).status, 400);
    assert.equal((await logFood(t, { ...ok, log_date: '2026-02-30' })).status, 400);
    assert.equal((await logFood(t, { ...ok, food_id: randomUUID() })).status, 404);
    assert.equal((await logFood(t, { ...ok, food_id: 'nope' })).status, 400);
  });

  it('quick add logs just calories and a name', async () => {
    const t = await newUser();
    const res = await logFood(t, {
      custom_name: 'Restaurant lunch',
      kcal: 850.4,
      meal_type: 'lunch',
      log_date: DAY,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.kcal, 850);
    assert.equal(res.body.name, 'Restaurant lunch');
    assert.equal(res.body.food_id, null);
    assert.equal(res.body.grams, null);
    assert.equal(
      (await logFood(t, { custom_name: '', kcal: 5, meal_type: 'snack', log_date: DAY })).status,
      400,
    );
  });

  it('a full day adds up exactly and only includes that date', async () => {
    const t = await newUser(2200);
    const entries = [
      ['Egg (boiled)', 100, 'breakfast'],
      ['Arabic pita bread', 60, 'breakfast'],
      ['Chicken breast (grilled)', 150, 'lunch'],
      ['White rice (cooked)', 200, 'lunch'],
      ['Banana', 118, 'snack'],
      ['Lentil soup', 250, 'dinner'],
    ] as const;
    for (const [name, grams, mealType] of entries) {
      const res = await logFood(t, {
        food_id: await foodId(t, name),
        grams,
        meal_type: mealType,
        log_date: DAY,
      });
      assert.equal(res.status, 201);
    }
    await logFood(t, {
      custom_name: 'Coffee shop cake',
      kcal: 410,
      meal_type: 'snack',
      log_date: DAY,
    });
    await logFood(t, {
      custom_name: 'Yesterday',
      kcal: 999,
      meal_type: 'dinner',
      log_date: '2026-11-04',
    });

    const day = (await api().get('/food-logs').query({ date: DAY }).set(bearer(t))).body;
    assert.equal(day.entries.length, 7);
    assert.equal(day.goal_kcal, 2200);
    const expected =
      Math.round(155 * 1) +
      Math.round(275 * 0.6) +
      Math.round(165 * 1.5) +
      Math.round(130 * 2) +
      Math.round(89 * 1.18) +
      Math.round(60 * 2.5) +
      410;
    assert.equal(day.totals.kcal, expected);
    assert.equal(
      day.totals.kcal,
      day.entries.reduce((s: number, e: { kcal: number }) => s + e.kcal, 0),
      'rows add up to the total',
    );
    const yesterday = (await api().get('/food-logs').query({ date: '2026-11-04' }).set(bearer(t)))
      .body;
    assert.equal(yesterday.totals.kcal, 999);
    const empty = (await api().get('/food-logs').query({ date: '2026-01-01' }).set(bearer(t))).body;
    assert.deepEqual(empty.totals, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    assert.deepEqual(empty.entries, []);
  });

  it('editing grams rescales the snapshot; meal and date can move', async () => {
    const t = await newUser();
    const e = (
      await logFood(t, {
        food_id: await foodId(t, 'Hummus'),
        grams: 60,
        meal_type: 'lunch',
        log_date: DAY,
      })
    ).body;
    const patched = await api()
      .patch(`/food-logs/${e.id}`)
      .set(bearer(t))
      .send({ grams: 120, meal_type: 'dinner', log_date: '2026-11-06' });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    assert.equal(patched.body.grams, 120);
    assert.equal(patched.body.kcal, 200);
    assert.equal(patched.body.protein_g, 9.6);
    assert.equal(patched.body.meal_type, 'dinner');
    assert.equal(patched.body.log_date, '2026-11-06');
    assert.equal(
      (await api().get('/food-logs').query({ date: DAY }).set(bearer(t))).body.entries.length,
      0,
    );
  });

  it('edits a quick add (name, kcal) but not grams, and a food entry not kcal', async () => {
    const t = await newUser();
    const quick = (
      await logFood(t, { custom_name: 'Cake', kcal: 300, meal_type: 'snack', log_date: DAY })
    ).body;
    const ok = await api()
      .patch(`/food-logs/${quick.id}`)
      .set(bearer(t))
      .send({ kcal: 350, custom_name: 'Big cake' });
    assert.equal(ok.body.kcal, 350);
    assert.equal(ok.body.name, 'Big cake');
    assert.equal(
      (await api().patch(`/food-logs/${quick.id}`).set(bearer(t)).send({ grams: 100 })).status,
      400,
    );

    const food = (
      await logFood(t, {
        food_id: await foodId(t, 'Banana'),
        grams: 100,
        meal_type: 'snack',
        log_date: DAY,
      })
    ).body;
    assert.equal(
      (await api().patch(`/food-logs/${food.id}`).set(bearer(t)).send({ kcal: 1 })).status,
      400,
    );
    assert.equal((await api().patch(`/food-logs/${food.id}`).set(bearer(t)).send({})).status, 400);
    assert.equal(
      (await api().patch(`/food-logs/${food.id}`).set(bearer(t)).send({ user_id: randomUUID() }))
        .status,
      400,
    );
  });

  it('deleting removes the entry and the total drops', async () => {
    const t = await newUser();
    const a = (await logFood(t, { custom_name: 'A', kcal: 100, meal_type: 'snack', log_date: DAY }))
      .body;
    await logFood(t, { custom_name: 'B', kcal: 250, meal_type: 'snack', log_date: DAY });
    assert.equal((await api().delete(`/food-logs/${a.id}`).set(bearer(t))).status, 204);
    const day = (await api().get('/food-logs').query({ date: DAY }).set(bearer(t))).body;
    assert.equal(day.totals.kcal, 250);
    assert.equal((await api().delete(`/food-logs/${a.id}`).set(bearer(t))).status, 404);
  });

  it('history survives a food being deleted: the snapshot and name remain', async () => {
    const t = await newUser();
    const food = (
      await api()
        .post('/foods')
        .set(bearer(t))
        .send({ name: 'Temporary food', kcal_per_100g: 100, protein_g: 10 })
    ).body;
    const e = (
      await logFood(t, { food_id: food.id, grams: 200, meal_type: 'lunch', log_date: DAY })
    ).body;
    await pg.query(`delete from foods where id = $1`, [food.id]);
    const after = (await api().get(`/food-logs/${e.id}`).set(bearer(t))).body;
    assert.equal(after.kcal, 200);
    assert.equal(after.name, 'Temporary food');
    assert.equal(after.food_id, null);
  });
});

describe('food log privacy', () => {
  it('nobody but the owner can read, edit or delete entries', async () => {
    const owner = await newUser();
    const other = await newUser();
    const e = (
      await logFood(owner, {
        custom_name: 'Private meal',
        kcal: 500,
        meal_type: 'dinner',
        log_date: DAY,
      })
    ).body;

    const theirs = (await api().get('/food-logs').query({ date: DAY }).set(bearer(other))).body;
    assert.deepEqual(theirs.entries, []);
    assert.equal(theirs.totals.kcal, 0);
    assert.equal((await api().get(`/food-logs/${e.id}`).set(bearer(other))).status, 404);
    assert.equal(
      (await api().patch(`/food-logs/${e.id}`).set(bearer(other)).send({ kcal: 1 })).status,
      404,
    );
    assert.equal((await api().delete(`/food-logs/${e.id}`).set(bearer(other))).status, 404);
    assert.equal(
      (await api().get(`/food-logs/${e.id}`).set(bearer(owner))).body.kcal,
      500,
      'untouched',
    );
  });

  it('even an accepted friend cannot read food logs', async () => {
    const a = await newUser();
    const b = await newUser();
    await pg.query(
      `insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`,
      [a.user.id, b.user.id],
    );
    await logFood(a, {
      custom_name: 'Friend must not see',
      kcal: 700,
      meal_type: 'dinner',
      log_date: DAY,
    });
    const seen = (await api().get('/food-logs').query({ date: DAY }).set(bearer(b))).body;
    assert.deepEqual(seen.entries, []);
  });

  it('requires login and a valid date', async () => {
    const t = await newUser();
    assert.equal((await api().get('/food-logs').query({ date: DAY })).status, 401);
    assert.equal((await api().get('/food-logs').set(bearer(t))).status, 400);
    assert.equal(
      (await api().get('/food-logs').query({ date: 'today' }).set(bearer(t))).status,
      400,
    );
  });
});
