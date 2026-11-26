import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platform, draft } from './helpers.mjs';

// 1×1 PNG and a fake "image" whose bytes are not an image.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const FAKE = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');

test('anyone can follow the built-in Sim2Skill team account', async () => {
  const p = await platform();
  try {
    const fan = await p.signup('Fan');
    const r = await p.request('users/sim2skill/follow', 'POST', {}, fan.cookie);
    assert.equal(r.status, 200, r.data?.error);
    const profile = (await p.request('profiles/sim2skill', 'GET', undefined, fan.cookie)).data;
    assert.equal(profile.followers, 1);
    assert.equal(profile.isFollowing, true);
    assert.equal((await p.request('users/sim2skill/follow', 'DELETE', {}, fan.cookie)).data.following, false);
    assert.equal((await p.request('users/nobody-here/follow', 'POST', {}, fan.cookie)).status, 404);
  } finally { await p.close(); }
});

test('profile pictures and lab thumbnails: upload, serve, replace, remove', async () => {
  const p = await platform();
  try {
    const { request, signup } = p;
    const me = await signup('Painter'), other = await signup('Other');
    assert.equal((await request('me/avatar', 'PUT', { image: PNG })).status, 401);
    assert.equal((await request('me/avatar', 'PUT', { image: FAKE }, me.cookie)).status, 400, 'content is sniffed, not trusted');
    assert.equal((await request('me/avatar', 'PUT', { image: 'data:image/svg+xml;base64,PHN2Zz4=' }, me.cookie)).status, 400, 'SVG is refused');
    const up = await request('me/avatar', 'PUT', { image: PNG }, me.cookie);
    assert.equal(up.status, 200);
    const url = up.data.user.avatar;
    assert.match(url, /^\/api\/media\/[0-9a-f-]{36}$/);
    const img = await fetch(p.base.replace(/\/api\/$/, '') + url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    const again = await request('me/avatar', 'PUT', { image: PNG }, me.cookie);
    assert.notEqual(again.data.user.avatar, url);
    assert.equal((await fetch(p.base.replace(/\/api\/$/, '') + url)).status, 404, 'the replaced image is deleted');
    assert.equal((await request('me/avatar', 'DELETE', {}, me.cookie)).data.user.avatar, null);

    const lab = (await request('labs', 'POST', draft, me.cookie)).data;
    assert.equal(lab.thumbnail, null);
    assert.equal((await request(`labs/${lab.id}/thumbnail`, 'PUT', { image: PNG }, other.cookie)).status, 403);
    const withThumb = await request(`labs/${lab.id}/thumbnail`, 'PUT', { image: PNG }, me.cookie);
    assert.match(withThumb.data.thumbnail, /^\/api\/media\//);
    await request(`labs/${lab.id}/submit`, 'POST', {}, me.cookie);
    assert.equal((await request('labs/' + lab.id)).data.thumbnail, withThumb.data.thumbnail);
    assert.equal((await request(`labs/${lab.id}/thumbnail`, 'DELETE', {}, me.cookie)).data.thumbnail, null);
  } finally { await p.close(); }
});

test('quizzes: validated on save, answers hidden from students, graded on the server', async () => {
  const p = await platform();
  try {
    const { request, signup } = p;
    const creator = await signup('Quiz Maker'), student = await signup('Quiz Taker');
    const quiz = [
      { q: 'What limits the LED current?', choices: ['The resistor', 'The LED colour'], answer: 0, explain: 'The resistor sets the current.' },
      { q: 'Reverse an LED and it…', choices: ['Glows', 'Stays dark', 'Explodes'], answer: 1 }
    ];
    assert.equal((await request('labs', 'POST', { ...draft, quiz: [{ q: 'No choices', choices: ['only one'], answer: 0 }] }, creator.cookie)).status, 400);
    assert.equal((await request('labs', 'POST', { ...draft, quiz: [{ q: 'Bad answer', choices: ['a', 'b'], answer: 5 }] }, creator.cookie)).status, 400);
    assert.equal((await request('labs', 'POST', { ...draft, quiz: [{ q: 'Same choices', choices: ['a', 'A'], answer: 0 }] }, creator.cookie)).status, 400);
    const lab = (await request('labs', 'POST', { ...draft, quiz }, creator.cookie)).data;
    assert.equal(lab.quiz[0].answer, 0, 'the owner sees the answer key');
    await request(`labs/${lab.id}/submit`, 'POST', {}, creator.cookie);

    const seen = (await request('labs/' + lab.id, 'GET', undefined, student.cookie)).data;
    assert.deepEqual(seen.quiz, [{ q: quiz[0].q, choices: quiz[0].choices }, { q: quiz[1].q, choices: quiz[1].choices }]);
    assert.equal((await request(`labs/${lab.id}/quiz`, 'POST', { answers: [0, 1] })).status, 401);
    assert.equal((await request(`labs/${lab.id}/quiz`, 'POST', { answers: [0] }, student.cookie)).status, 400);
    assert.equal((await request(`labs/${lab.id}/quiz`, 'POST', { answers: [0, 9] }, student.cookie)).status, 400);
    const first = (await request(`labs/${lab.id}/quiz`, 'POST', { answers: [1, 1] }, student.cookie)).data;
    assert.equal(first.score, 1);
    assert.equal(first.results[0].correct, false);
    assert.equal(first.results[0].answer, 0);
    assert.equal(first.results[0].explain, 'The resistor sets the current.');
    const second = (await request(`labs/${lab.id}/quiz`, 'POST', { answers: [0, 1] }, student.cookie)).data;
    assert.equal(second.score, 2);
    assert.equal(second.best, 2);
    assert.equal(second.tries, 2);

    await request('practice', 'POST', { labId: lab.id }, student.cookie);
    const history = (await request('practice', 'GET', undefined, student.cookie)).data;
    assert.deepEqual(history.find(h => h.labId === lab.id).quiz, { best: 2, total: 2 });

    const builtin = (await request('labs/titration', 'GET', undefined, student.cookie)).data;
    assert.equal(builtin.quiz.length, 3);
    assert.equal(builtin.quiz[0].answer, undefined);
    assert.equal((await request('labs/titration/quiz', 'POST', { answers: [2, 1, 1] }, student.cookie)).data.score, 3);
  } finally { await p.close(); }
});
