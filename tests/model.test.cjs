const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
for (const file of ['data/stembureaus.js', 'data/uitslagen.js', 'data/kandidaten.js', 'data/partijen_lr.js', 'model.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
}
const evaluate = (code) => vm.runInContext(code, context);
test('17 verkiezingen en bekende gemeentetotalen blijven behouden', () => {
  assert.equal(evaluate('ELECTIONS.length'), 17);
  assert.equal(evaluate('gemAvg.GR2026.vvd'), 3131);
  assert.equal(evaluate('gemAvg.TK2025.vvd'), 6264);
  assert.equal(evaluate('gemAvg.PS2023.vvd'), 4244);
});
test('ontbrekende opkomst blijft onbekend', () => {
  for (const id of ['EP2009', 'TK2010', 'TK2012']) assert.equal(evaluate(`gemAvg.${id}.opkomst`), null);
  assert.ok(Math.abs(evaluate('gemAvg.GR2026.opkomst') - 59.3) < 0.1);
  assert.ok(Math.abs(evaluate('gemAvg.GR2022.opkomst') - 55.1) < 0.1);
});
test('alle vaste locaties, ook historische zonder postcode, hebben een kern', () => {
  assert.equal(evaluate('STEMBUREAUS.filter(s => !s.mobiel && !kernVan(s)).length'), 0);
  for (const id of ['TK2010', 'EP2009', 'GR2014']) {
    assert.equal(evaluate(`KERNEN.reduce((sum, k) => sum + (getU(kernId(k), '${id}')?.geldig || 0), 0)`),
      evaluate(`STEMBUREAUS.filter(s=>!s.mobiel).reduce((sum,s)=>sum+(getU(s.id,'${id}')?.geldig || 0),0)`));
  }
});
test('politieke score heeft transparante dekking op basis van echte stemmen', () => {
  assert.ok(Math.abs(evaluate('gemPositie.GR2026.dekking') - 64.65845) < 0.001);
  assert.ok(evaluate('gemPositie.EP2009.dekking') > 95);
});
