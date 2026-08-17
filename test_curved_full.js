const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blacklist','--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });

  await page.goto('file://' + process.cwd() + '/EUROPA-2025-3D.html');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('startBtn').click());
  let state = '';
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); state = await page.evaluate(() => window.__debug.getState()); if (state === 'playing') break; }
  console.log('1) playing:', state);
  await page.screenshot({ path: 'curved-01-europa.png' });

  await page.evaluate(async () => {
    const dbg = window.__debug;
    for (const p of dbg.parts) { dbg.player.x = p.x; dbg.player.z = p.z; await new Promise(r => setTimeout(r, 60)); }
  });
  console.log('2) collected:', await page.evaluate(() => window.__debug.collectedCount()));

  await page.evaluate(() => window.__debug.beginTransition());
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); state = await page.evaluate(() => window.__debug.getState()); if (state === 'combat') break; }
  console.log('3) jupiter combat:', state, 'stage:', await page.evaluate(() => window.__debug.getMissionStage()));
  await page.screenshot({ path: 'curved-02-jupiter.png' });

  // hitscan aim test on jupiter boss
  const jHit = await page.evaluate(() => {
    const dbg = window.__debug;
    const b = dbg.getBoss();
    b.moveSpeed = 0;
    dbg.player.x = b.x; dbg.player.z = b.z + 20;
    dbg.player.facing = Math.PI;
    dbg.setPitch(0.18);
    return b.health;
  });
  await page.waitForTimeout(1000);
  const jAfter = await page.evaluate(() => { const dbg = window.__debug; dbg.firePlayerWeapon(); return dbg.getBoss().health; });
  console.log('4) jupiter hitscan:', jHit, '->', jAfter, jAfter < jHit ? 'HIT' : 'MISS');

  await page.evaluate(() => {
    const dbg = window.__debug;
    const b = dbg.getBoss();
    let guard = 0; while (b.health > 0 && guard < 200) { dbg.damageAlien(50); guard++; }
  });
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); state = await page.evaluate(() => window.__debug.getState()); if (state === 'combat') break; }
  console.log('5) uranus combat:', state, 'stage:', await page.evaluate(() => window.__debug.getMissionStage()));
  await page.screenshot({ path: 'curved-03-uranus.png' });

  const uHit = await page.evaluate(() => {
    const dbg = window.__debug;
    const b = dbg.getBoss();
    b.moveSpeed = 0;
    dbg.player.x = b.x; dbg.player.z = b.z + 20;
    dbg.player.facing = Math.PI;
    dbg.setPitch(0.18);
    return b.health;
  });
  await page.waitForTimeout(1000);
  const uAfter = await page.evaluate(() => { const dbg = window.__debug; dbg.firePlayerWeapon(); return dbg.getBoss().health; });
  console.log('6) uranus hitscan:', uHit, '->', uAfter, uAfter < uHit ? 'HIT' : 'MISS');

  await page.evaluate(() => {
    const dbg = window.__debug;
    const b = dbg.getBoss();
    let guard = 0; while (b.health > 0 && guard < 200) { dbg.damageAlien(50); guard++; }
  });
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    state = await page.evaluate(() => window.__debug.getState());
    if (i % 10 === 0) console.log('   ...waiting', i, state, JSON.stringify(await page.evaluate(() => window.__debug.getTransition3())));
    if (state === 'combat') break;
  }
  console.log('7) saturn combat:', state, 'stage:', await page.evaluate(() => window.__debug.getMissionStage()), 'alive:', await page.evaluate(() => window.__debug.getSaturnAliveCount()));
  await page.screenshot({ path: 'curved-05-saturn.png' });

  // hitscan aim test on one saturn mini alien (track it by fixed array index,
  // not "first alive" — a hit with the cannon's 3x multiplier one-shots a
  // 26-hp mini alien, so re-searching "first alive" after firing would
  // silently pick a different, unharmed alien and look like a miss).
  // Mini aliens are much smaller than the bosses (hitRadius 2.1 vs 4.4-5.1),
  // so a fixed guessed pitch is too imprecise — instead sample the camera's
  // actual aim error once and correct pitch analytically before firing.
  const sHit = await page.evaluate(() => {
    const dbg = window.__debug;
    const idx = dbg.miniAliens.findIndex(a => a.alive);
    if (idx < 0) return null;
    const m = dbg.miniAliens[idx];
    m.moveSpeed = 0;
    dbg.player.x = m.x; dbg.player.z = m.z + 20;
    dbg.player.facing = Math.PI;
    dbg.setPitch(0.1);
    window.__testTargetIdx = idx;
    return m.health;
  });
  let lastD = Infinity;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    lastD = await page.evaluate(() => {
      const dbg = window.__debug;
      const m = dbg.miniAliens[window.__testTargetIdx];
      const origin = dbg.camera.position.clone();
      const dir = new THREE.Vector3();
      dbg.camera.getWorldDirection(dir);
      const mUp = new THREE.Vector3(0,1,0).applyQuaternion(m.mesh.quaternion);
      const alienPos = m.mesh.position.clone().addScaledVector(mUp, m.headHeight);
      const toAlien = alienPos.clone().sub(origin);
      const t = toAlien.dot(dir);
      const closest = origin.clone().add(dir.clone().multiplyScalar(t));
      const errY = alienPos.y - closest.y;
      const d = closest.distanceTo(alienPos);
      if (d >= m.hitRadius) dbg.setPitch(dbg.getPitch() + Math.atan2(errY, t));
      return d;
    });
    if (lastD < 1.8) break; // comfortably inside hitRadius (2.1) before firing
  }
  console.log('   (saturn aim converged, final d =', lastD, ')');
  // NOTE: the swarm stands in a tight ring, so the ray aimed at our tracked
  // alien can pass close enough to a NEIGHBOR to hit that one instead (closest
  // valid hit wins, same "closest hit" rule as the single-boss hitscan) — so
  // the correct invariant here is "total swarm health went down", not "this
  // exact indexed alien took the damage".
  const beforeTotal = await page.evaluate(() => window.__debug.miniAliens.reduce((s,m)=>s+m.health,0));
  await page.evaluate(() => { window.__debug.firePlayerWeapon(); });
  const afterTotal = await page.evaluate(() => window.__debug.miniAliens.reduce((s,m)=>s+m.health,0));
  console.log('8) saturn hitscan swarm total health:', beforeTotal, '->', afterTotal, afterTotal < beforeTotal ? 'HIT' : 'MISS');

  // wipe out the whole swarm via damageMiniAlien
  await page.evaluate(() => {
    const dbg = window.__debug;
    let guard = 0;
    while (dbg.getSaturnAliveCount() > 0 && guard < 2000) {
      const m = dbg.miniAliens.find(a => a.alive);
      if (!m) break;
      dbg.damageMiniAlien(m, 50);
      guard++;
    }
  });
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(500); state = await page.evaluate(() => window.__debug.getState()); if (state === 'win') break; }
  console.log('9) final:', state, 'alive after wipe:', await page.evaluate(() => window.__debug.getSaturnAliveCount()));
  await page.screenshot({ path: 'curved-06-win.png' });

  // asteroid belt visibility sanity
  const beltInfo = await page.evaluate(() => {
    const dbg = window.__debug;
    const belt = dbg.scene.children.find(o => o.isInstancedMesh);
    return belt ? { count: belt.count, visible: belt.visible, pos: belt.position.toArray() } : null;
  });
  console.log('10) asteroid belt:', JSON.stringify(beltInfo));

  // replay reset sanity
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForTimeout(1000);
  console.log('11) after replay:', await page.evaluate(() => window.__debug.getState()), 'saturn alive reset:', await page.evaluate(() => window.__debug.getSaturnAliveCount()));

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})();
