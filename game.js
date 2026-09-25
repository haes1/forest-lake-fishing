import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

(() => {
  'use strict';

  const view = document.querySelector('#lake');
  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);

  const fishTypes = [
    { id: 'roach', name: 'Плотва', icon: '🐟', min: .08, max: .45, price: 95, power: .7, rare: false },
    { id: 'perch', name: 'Окунь', icon: '🐠', min: .12, max: .9, price: 145, power: .9, rare: false },
    { id: 'crucian', name: 'Карась', icon: '🐡', min: .18, max: 1.7, price: 210, power: 1.05, rare: false },
    { id: 'tench', name: 'Линь', icon: '🐟', min: .35, max: 2.4, price: 280, power: 1.25, rare: true },
    { id: 'pike', name: 'Щука', icon: '🦈', min: .8, max: 6.5, price: 520, power: 1.75, rare: true },
    { id: 'zander', name: 'Судак', icon: '🐟', min: .7, max: 5.8, price: 610, power: 1.65, rare: true },
    { id: 'burbot', name: 'Налим', icon: '🐍', min: .6, max: 4.2, price: 470, power: 1.5, rare: true },
    { id: 'carp', name: 'Зеркальный карп', icon: '🐠', min: 1.3, max: 8.5, price: 760, power: 2.05, rare: true }
  ];
  const spots = [
    { id: 'bridge', name: 'Старый мостик', weather: 'Пасмурно · клёв хороший', unlock: 1, fish: ['roach', 'perch', 'crucian', 'tench'] },
    { id: 'reeds', name: 'Камышовая заводь', weather: 'Лёгкий ветер · клёв средний', unlock: 2, fish: ['perch', 'crucian', 'tench', 'pike'] },
    { id: 'deep', name: 'Глубокий омут', weather: 'Туман · клёв осторожный', unlock: 4, fish: ['pike', 'zander', 'burbot', 'carp'] }
  ];
  const gear = [
    { id: 'rod', name: 'Удилище', icon: '🎣', levels: [0, 120, 420, 950], values: [1, 1.14, 1.32, 1.58], labels: ['Телескоп 4 м', 'Маховое 5 м', 'Матчевое 6 м', 'Профессиональное'] },
    { id: 'line', name: 'Леска', icon: '〰️', levels: [0, 90, 330, 800], values: [1, 1.12, 1.28, 1.5], labels: ['0.16 мм', '0.20 мм', '0.25 мм', '0.30 мм'] },
    { id: 'bait', name: 'Наживка', icon: '🪱', levels: [0, 70, 220], values: [1, 1.18, 1.38], labels: ['Червь', 'Опарыш', 'Кукуруза'] }
  ];

  const defaultState = () => ({ money: 650, xp: 0, level: 1, spot: 'bridge', gear: { rod: 0, line: 0, bait: 0 }, keep: [], album: {}, best: {}, total: 0 });
  let state = loadState();
  let phase = 'ready';
  let currentFish = null;
  let biteAt = 0;
  let fightRaf = 0;
  let lastFrame = performance.now();
  let tension = 28;
  let fishDistance = 100;
  let noticeTimer = 0;
  let pendingCatch = null;
  const trophyRot = { yaw: .5, pitch: .05, spin: true };
  let reeling = false;
  let biteTimer = 0;
  let biteExpireTimer = 0;
  let stamina = 100;
  let rushing = false;
  let rushUntil = 0;
  let nextRushAt = 0;
  let fightStartedAt = 0;

  function loadState() { try { return { ...defaultState(), ...JSON.parse(localStorage.getItem('forest-lake-save') || '{}') }; } catch { return defaultState(); } }
  function saveState() { localStorage.setItem('forest-lake-save', JSON.stringify(state)); }
  function currentSpot() { return spots.find((spot) => spot.id === state.spot) || spots[0]; }
  function fishById(id) { return fishTypes.find((fish) => fish.id === id); }
  function levelXp(level) { return 180 + (level - 1) * 120; }
  function gearValue(type) { const item = gear.find((entry) => entry.id === type); return item.values[state.gear[type]]; }
  function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
  function showNotice(message) { const node = $('#notice'); node.textContent = message; node.classList.add('show'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => node.classList.remove('show'), 2300); }
  function updateLevel() { let required = levelXp(state.level); while (state.xp >= required) { state.xp -= required; state.level += 1; showNotice(`Новый уровень: ${state.level}!`); required = levelXp(state.level); } }
  function updateHud() {
    setText('#level', state.level); setText('#money', state.money); setText('#keep-count', state.keep.length); setText('#spot-name', currentSpot().name); setText('#weather', currentSpot().weather);
    $('#bite-fill').style.width = phase === 'bite' ? `${clamp((performance.now() - biteAt) / 1500 * 100, 0, 100)}%` : '0%'; $('#tension-fill').style.width = `${tension}%`; setText('#tension-value', `${Math.round(tension)}%`);
    const limit = lineLimit(); const limitNode = $('#tension-limit'); if (limitNode) limitNode.style.left = `${limit}%`;
    const tensionFill = $('#tension-fill'); tensionFill.classList.toggle('danger', tension > limit - 10);
    const staminaFill = $('#stamina-fill'); if (staminaFill) staminaFill.style.width = `${clamp(100 - stamina, 0, 100)}%`;
    setText('#stamina-value', `${Math.round(clamp(100 - stamina, 0, 100))}%`);
    const rushNode = $('#rush-flag'); if (rushNode) rushNode.hidden = !(phase === 'fight' && rushing);
    const fightHint = $('#fight-hint'); if (fightHint) fightHint.textContent = rushing ? 'Рыба идёт на рывок ��� отпустите катушку, иначе леска лопнет.' : stamina > 55 ? 'Рыба свежая: тяните короткими подходами и держите натяжение в зелёной зоне.' : 'Рыба устала — можно тянуть смелее.';
    $('#reel-button').hidden = phase !== 'fight'; $('#cast-button').hidden = phase === 'fight' || phase === 'trophy'; $('#fight-panel').hidden = phase !== 'fight'; $('#status-panel').hidden = phase === 'fight';
    const cast = $('#cast-button'); cast.textContent = phase === 'ready' ? '🎣 Забросить' : phase === 'waiting' ? '⏳ Ждём поклёвку' : phase === 'bite' ? '⚡ Подсечь!' : '🎣 Забросить снова'; cast.disabled = phase === 'waiting' || phase === 'fight' || phase === 'trophy';
  }
  function setPhase(next) {
    phase = next; updateHud();
    const labels = { ready: ['ГОТОВ К ЗАБРОСУ', 'Поплавочная удочка', 'Нажмите «Забросить», чтобы отправить снасть в воду.'], waiting: ['СНАСТЬ В ВОДЕ', 'Ожидание поклёвки', 'Следите за поплавком. Подсечка сработает только в момент поклёвки.'], bite: ['ПОКЛЁВКА!', 'Рыба взяла наживку', 'Быстро нажмите кнопку или коснитесь экрана для подсечки!'], result: ['УЛОВ ОФОРМЛЕН', 'Можно продолжить ловлю', 'Продайте рыбу в разделе «Садок» или забросьте снасть снова.'], trophy: ['ТРОФЕЙ', 'Рассмотрите улов', 'Крутите рыбу пальцем и выберите: оставить или отпустить.'] };
    const data = labels[next]; if (data) { setText('#phase-label', data[0]); setText('#phase-value', data[1]); setText('#hint', data[2]); }
  }
  function chooseFish() {
    const candidates = currentSpot().fish.map(fishById); const weights = candidates.map((fish) => fish.rare ? .18 * gearValue('bait') : 1); let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i += 1) { roll -= weights[i]; if (roll <= 0) return candidates[i]; } return candidates[0];
  }
  function cast() {
    if (phase === 'bite') return startFight();
    if (phase === 'waiting') return;
    clearTimeout(biteTimer); clearTimeout(biteExpireTimer);
    const waitMs = random(3500, 7600);
    biteAt = performance.now() + waitMs;
    setPhase('waiting'); showNotice('Поплавок на воде');
    biteTimer = window.setTimeout(() => {
      if (phase !== 'waiting') return;
      setPhase('bite'); showNotice('Поклёвка! Подсекайте!');
      biteExpireTimer = window.setTimeout(() => {
        if (phase === 'bite') { setPhase('ready'); showNotice('Поздняя подсечка — рыба ушла'); }
      }, 1800);
    }, waitMs);
  }
  function lineLimit() { return 70 + (gearValue('line') - 1) * 24; }
  function startFight() {
    if (phase !== 'bite') return; const fish = chooseFish(); const weight = random(fish.min, fish.max) * (1 + state.level * .025); currentFish = { ...fish, weight }; tension = 30; fishDistance = 100;
    stamina = 100; rushing = false; fightStartedAt = performance.now(); nextRushAt = fightStartedAt + random(2000, 3600); setText('#fish-name', currentFish.name); setText('#fish-weight', `${weight.toFixed(2)} кг`); setPhase('fight'); showNotice(`${currentFish.name} на крючке!`); lastFrame = performance.now(); cancelAnimationFrame(fightRaf); fightRaf = requestAnimationFrame(fightLoop);
    clearTimeout(biteTimer); clearTimeout(biteExpireTimer);
  }
  function finishFish(success) {
    cancelAnimationFrame(fightRaf); rushing = false; if (!success) { setPhase('ready'); updateHud(); return; }
    const value = Math.max(12, Math.round(currentFish.weight * currentFish.price * (1 + state.level * .04)));
    pendingCatch = { ...currentFish, value };
    state.album[currentFish.id] = (state.album[currentFish.id] || 0) + 1;
    state.best[currentFish.id] = Math.max(state.best[currentFish.id] || 0, currentFish.weight);
    saveState(); openTrophy();
  }
  // Экран трофея: рыба крупным планом, её можно вращать и решить судьбу.
  function openTrophy() {
    trophyRot.yaw = .5; trophyRot.pitch = .05; trophyRot.spin = true;
    setText('#trophy-name', pendingCatch.name);
    setText('#trophy-weight', `${pendingCatch.weight.toFixed(2)} кг`);
    setText('#trophy-price', `${pendingCatch.value} ₽`);
    $('#trophy-layer').hidden = false;
    setPhase('trophy'); showNotice(`Вывели: ${pendingCatch.name}, ${pendingCatch.weight.toFixed(2)} кг`);
  }
  function closeTrophy() { $('#trophy-layer').hidden = true; pendingCatch = null; setPhase('result'); updateHud(); }
  function keepFish() {
    if (!pendingCatch) return;
    state.keep.push({ ...pendingCatch, caughtAt: Date.now() });
    state.total += pendingCatch.weight; state.xp += Math.round(pendingCatch.weight * 32 + 25);
    updateLevel(); saveState(); showNotice(`В садок: ${pendingCatch.name} · ${pendingCatch.value} ₽`); closeTrophy();
  }
  function releaseFish() {
    if (!pendingCatch) return;
    state.xp += Math.round(pendingCatch.weight * 18 + 35);
    updateLevel(); saveState(); showNotice(`${pendingCatch.name} отпущена — +опыт за бережную ловлю`); closeTrophy();
  }
  function fightLoop(now) {
    if (phase !== 'fight') return; const dt = Math.min(45, now - lastFrame) / 16.67; lastFrame = now;
    // Рывки: рыба пер��одически делает бросок, во время которого тянуть нельзя.
    if (!rushing && now >= nextRushAt && stamina > 18) {
      rushing = true; rushUntil = now + random(800, 1500); showNotice('Рывок! Отпустите катушку');
    } else if (rushing && now >= rushUntil) {
      rushing = false; nextRushAt = now + random(2400, 4600);
    }
    const freshness = .4 + (stamina / 100) * .6; // уставшая рыба тянет слабее
    const fishPull = currentFish.power * (Math.sin(now / 330) * .9 + 1.4) * freshness * (rushing ? 1.9 : 1);
    const heavy = .55 + currentFish.power * .45; // крупная рыба устаёт медленнее
    if (reeling) {
      // Выбирать леску почти бесполезно, пока рыба свежая — сначала её нужно утомить.
      fishDistance -= Math.max(.04, (.42 + gearValue('line') * gearValue('rod') * .20) * (1 - stamina / 144)) * dt;
      tension += (fishPull * .52 - .9 + (rushing ? fishPull * 1.75 : 0)) * dt;
      stamina -= (.26 * (.65 + gearValue('rod') * .5) / heavy) * dt;
    } else {
      fishDistance += (rushing ? .8 : .18) * dt;
      tension -= Math.max(.5, 2.1 - fishPull * .3) * dt;
      stamina -= (rushing ? .078 : -.09) * dt; // рывок утомляет рыбу, покой восстанавливает силы
    }
    stamina = clamp(stamina, 0, 100); tension = clamp(tension, 0, 105); fishDistance = clamp(fishDistance, -3, 108);
    if (tension > lineLimit()) { showNotice('Леска не выдержала — рыба ушла'); return finishFish(false); }
    if (fishDistance >= 108) { showNotice('Рыба ушла в коряги'); return finishFish(false); }
    if (fishDistance <= 0) return finishFish(true);
    updateHud(); fightRaf = requestAnimationFrame(fightLoop);
  }
  function sellAll() { if (!state.keep.length) return showNotice('В садке пока пусто'); const total = state.keep.reduce((sum, fish) => sum + fish.value, 0); const count = state.keep.length; state.money += total; state.keep = []; saveState(); updateHud(); showNotice(`Продано ${count} шт. на ${total} ₽`); openPanel('bag'); }
  function buyGear(type) { const item = gear.find((entry) => entry.id === type); const next = state.gear[type] + 1; if (next >= item.levels.length) return; const cost = item.levels[next]; if (state.money < cost) return showNotice('Не хва��ает денег'); state.money -= cost; state.gear[type] = next; saveState(); updateHud(); showNotice(`${item.name} улучшено`); openPanel('tackle'); }
  function changeSpot(id) { const spot = spots.find((entry) => entry.id === id); if (!spot || state.level < spot.unlock) return showNotice(`Нужно достичь ${spot?.unlock || 1} уровня`); state.spot = id; saveState(); updateHud(); closeModal(); showNotice(`Вы выбрали: ${spot.name}`); }
  function openPanel(panel) {
    const content = $('#modal-content'); const spot = currentSpot();
    if (panel === 'spots') content.innerHTML = `<h2>Места ловли</h2><p class="sub">Выбирайте водоём по уровню и составу рыбы.</p><div class="card-grid">${spots.map((entry) => `<article class="menu-card"><strong>${entry.name}</strong><p>${entry.weather}<br>${entry.fish.map((id) => fishById(id).name).join(' · ')}</p><button data-spot="${entry.id}" ${state.level < entry.unlock ? 'disabled' : ''}>${state.level < entry.unlock ? `🔒 ${entry.unlock} ур.` : entry.id === spot.id ? 'Выбрано' : 'Отправиться'}</button></article>`).join('')}</div>`;
    if (panel === 'tackle') content.innerHTML = `<h2>Снасти</h2><p class="sub">Улучшайте снасть, чтобы уверенно вываживать крупную рыбу.</p><div class="card-grid">${gear.map((item) => { const current = state.gear[item.id]; const maxed = current >= item.levels.length - 1; const cost = item.levels[current + 1]; return `<article class="menu-card"><strong>${item.icon} ${item.name}</strong><p>${item.labels[current]}<br>Бонус прочности: ×${item.values[current].toFixed(2)}</p><button data-gear="${item.id}" ${maxed || state.money < cost ? 'disabled' : ''}>${maxed ? 'Максимум' : `Улучшить · ${cost} ₽`}</button></article>`; }).join('')}</div>`;
    if (panel === 'album') content.innerHTML = `<h2>Альбом рыболова</h2><p class="sub">Поймано видов: ${Object.keys(state.album).length} из ${fishTypes.length}. Лучшие экземпляры сохраняются.</p><div>${fishTypes.map((fish) => state.album[fish.id] ? `<div class="fish-entry"><span class="fish-icon">${fish.icon}</span><div><strong>${fish.name}</strong><small>${state.album[fish.id]} поймано · рекорд ${state.best[fish.id].toFixed(2)} кг</small></div><em>${fish.rare ? 'Редкая' : 'Обычная'}</em></div>` : `<div class="fish-entry"><span class="fish-icon">?</span><div><strong>Неизвестный вид</strong><small>Попробуйте другие места</small></div><em>???</em></div>`).join('')}</div>`;
    if (panel === 'bag') content.innerHTML = `<h2>Садок</h2><p class="sub">Здесь хранится свежий улов. Продайте его на базе.</p>${state.keep.length ? `<div>${state.keep.map((fish) => `<div class="fish-entry"><span class="fish-icon">${fish.icon}</span><div><strong>${fish.name}</strong><small>${fish.weight.toFixed(2)} кг · ${fish.value} ₽</small></div><em>в садке</em></div>`).join('')}</div><button class="wide-button" id="sell-all">Продать весь улов · ${state.keep.reduce((sum, fish) => sum + fish.value, 0)} ₽</button>` : '<div class="empty">Садок пуст. Самое время забросить снасть!</div>'}`;
    $('#modal-backdrop').hidden = false; content.querySelectorAll('[data-spot]').forEach((button) => button.addEventListener('click', () => changeSpot(button.dataset.spot))); content.querySelectorAll('[data-gear]').forEach((button) => button.addEventListener('click', () => buyGear(button.dataset.gear))); $('#sell-all')?.addEventListener('click', sellAll);
  }
  function closeModal() { $('#modal-backdrop').hidden = true; }

  // ===== 3D-сцена и анимации =====
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9bbab5); scene.fog = new THREE.Fog(0x8caeaa, 38, 105);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; view.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(53, 1, .1, 160); camera.position.set(8, 5.8, 13); camera.lookAt(0, 0, -4);
  scene.add(new THREE.HemisphereLight(0xd6eee5, 0x1d3c39, 2.3));
  const sun = new THREE.DirectionalLight(0xffe0ac, 3.2); sun.position.set(-12, 18, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
  const mat = (color, roughness = .75, transparent = false) => new THREE.MeshStandardMaterial({ color, roughness, transparent, opacity: transparent ? .88 : 1 });
  const box = (x, y, z, color) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat(color)); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };

  // Вода
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 120, 60, 60), new THREE.MeshStandardMaterial({ color: 0x217c86, roughness: .16, metalness: .1, transparent: true, opacity: .92 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -.55; water.receiveShadow = true; scene.add(water);
  const waterBase = []; for (let i = 0; i < water.geometry.attributes.position.count; i += 1) waterBase.push([water.geometry.attributes.position.getX(i), water.geometry.attributes.position.getY(i)]);
  const waterPos = water.geometry.attributes.position;
  const waveAt = (x, z, t) => Math.sin(x * .22 + t * 1.4) * .1 + Math.cos(z * .17 + t) * .08 + Math.sin((x + z) * .09 - t * .7) * .05;

  // Берега, мостик, деревья
  const shore = box(65, .5, 15, 0x5f7954); shore.position.set(0, -.2, 13); shore.rotation.y = -.08; scene.add(shore);
  const farShore = box(75, 1.5, 7, 0x557467); farShore.position.set(0, 0, -28); scene.add(farShore);
  const dock = new THREE.Group(); dock.position.set(-3.8, .15, 6.6); dock.rotation.y = -.12; dock.add(box(6.8, .35, 2.3, 0x95603d));
  for (let i = -2; i <= 2; i += 1) { const post = box(.25, 2.4, .25, 0x63432f); post.position.set(i * 1.2, -1.1, .65); dock.add(post); }
  scene.add(dock);
  const swayables = [];
  function tree(x, z, scale = 1) { const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); group.add(box(.45, 3.6, .45, 0x604633)); for (let i = 0; i < 3; i += 1) { const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * .35, 3.8, 7), mat(0x2f6556)); crown.position.y = 2 + i * 1.15; crown.castShadow = true; group.add(crown); } scene.add(group); swayables.push({ node: group, phase: Math.random() * 6.28, amp: .012 + Math.random() * .01 }); }
  tree(-10, 9, 1.4); tree(-14, 2, 1.05); tree(11, 9, 1.35); tree(15, -2, .9); tree(-15, -18, 1.3); tree(12, -20, 1.1);
  // Камыш у берега
  for (let i = 0; i < 26; i += 1) {
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(.03, .05, random(1.1, 2.3), 5), mat(0x6f8f55));
    reed.position.set(random(-18, 18), -.1, random(2.5, 7.5)); reed.castShadow = true; scene.add(reed);
    swayables.push({ node: reed, phase: Math.random() * 6.28, amp: .05 + Math.random() * .05 });
  }
  // Облака
  const clouds = []; for (let i = 0; i < 6; i += 1) { const cloud = new THREE.Group(); for (let p = 0; p < 3; p += 1) { const puff = new THREE.Mesh(new THREE.SphereGeometry(random(1.6, 3), 10, 7), new THREE.MeshBasicMaterial({ color: 0xf3f8f2, transparent: true, opacity: .55 })); puff.position.set(p * random(1.8, 2.6) - 2.4, random(-.4, .4), random(-.6, .6)); cloud.add(puff); } cloud.position.set(random(-40, 40), random(16, 24), random(-60, -34)); scene.add(cloud); clouds.push(cloud); }

  // Удилище с изгибом
  const rod = new THREE.Group(); rod.position.set(-1.3, 2.1, 5.6); rod.rotation.x = -.18; rod.rotation.z = -.1;
  const rodBase = new THREE.Mesh(new THREE.CylinderGeometry(.14, .21, 3.6, 8), mat(0x9e633d)); rodBase.rotation.z = -.22; rod.add(rodBase);
  const rodBend = new THREE.Group(); rod.add(rodBend);
  const rodTip = new THREE.Mesh(new THREE.CylinderGeometry(.025, .06, 4.7, 8), mat(0xe1b36d)); rodTip.position.set(-1.55, .65, -.35); rodTip.rotation.z = -.12; rodBend.add(rodTip);
  const rodTipAnchor = new THREE.Object3D(); rodTipAnchor.position.set(-1.55, .65, -.35); rodBend.add(rodTipAnchor);
  scene.add(rod);
  const tipWorld = new THREE.Vector3();

  // Леска — провисающая кривая
  const LINE_SEGMENTS = 26;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(LINE_SEGMENTS + 1).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xf2e5bd, transparent: true, opacity: .85 }));
  scene.add(line);

  // Поплавок
  const bobber = new THREE.Group();
  const bobTop = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 10), mat(0xee7e58)); bobTop.position.y = .12; bobber.add(bobTop);
  const bobBottom = new THREE.Mesh(new THREE.CylinderGeometry(.045, .07, .3, 8), mat(0xf5ecb9)); bobBottom.position.y = -.08; bobber.add(bobBottom);
  const bobAntenna = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .3, 6), mat(0xfff3d4)); bobAntenna.position.y = .34; bobber.add(bobAntenna);
  bobber.visible = false; scene.add(bobber);
  const BOB_TARGET = new THREE.Vector3(2.5, -.35, -3.4);

  // Брызги и круги на воде
  const ripples = [];
  for (let i = 0; i < 10; i += 1) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.28, .38, 28), new THREE.MeshBasicMaterial({ color: 0xdff5ee, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring); ripples.push({ mesh: ring, life: 0, max: 1, scale: 1 });
  }
  function spawnRipple(position, scale = 1, duration = 1.1) {
    const slot = ripples.find((entry) => entry.life <= 0) || ripples[0];
    slot.mesh.position.set(position.x, -.45, position.z); slot.mesh.scale.setScalar(.3 * scale); slot.mesh.visible = true; slot.life = duration; slot.max = duration; slot.scale = scale;
  }
  const droplets = [];
  for (let i = 0; i < 26; i += 1) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 5), new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: .9 }));
    drop.visible = false; scene.add(drop); droplets.push({ mesh: drop, life: 0, velocity: new THREE.Vector3() });
  }
  function spawnSplash(position, power = 1, count = 10) {
    let spawned = 0;
    for (const drop of droplets) {
      if (drop.life > 0) continue;
      drop.mesh.position.copy(position); drop.mesh.visible = true; drop.life = random(.4, .8);
      drop.velocity.set(random(-1.6, 1.6) * power, random(1.8, 3.6) * power, random(-1.6, 1.6) * power);
      if (++spawned >= count) break;
    }
    spawnRipple(position, power, 1.2);
  }

  // Рыба
  const fishMesh = new THREE.Group();
  const fallbackFish = new THREE.Group();
  const fishBody = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat(0xd28e56, .55)); fishBody.scale.set(1.65, .52, .58); fallbackFish.add(fishBody);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.65, 1.35, 4), mat(0x8b5a3d)); tail.rotation.z = Math.PI / 2; tail.position.x = -1.75; fallbackFish.add(tail);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), mat(0x10191a)); eye.position.set(1.05, .22, .43); fallbackFish.add(eye);
  fishMesh.add(fallbackFish); fishMesh.position.set(4, -4, -6); fishMesh.visible = false; scene.add(fishMesh);
  const loadedFish = new Map(); const fishMixers = [];
  const fishAssetFiles = { roach: 'goldfish.glb', perch: 'butterfly-fish.glb', crucian: 'mandarin-fish.glb', tench: 'mandarin-fish.glb', pike: 'butterfly-fish.glb', zander: 'butterfly-fish.glb', burbot: 'mandarin-fish.glb', carp: 'goldfish.glb' };
  const gltfLoader = new GLTFLoader();
  Object.entries(fishAssetFiles).forEach(([fishId, filename]) => gltfLoader.load(`assets/fish/${filename}`, (gltf) => {
    const model = gltf.scene; const bounds = new THREE.Box3().setFromObject(model); const size = bounds.getSize(new THREE.Vector3()); const factor = 2.7 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(factor); const center = bounds.getCenter(new THREE.Vector3()); model.position.set(-center.x * factor, -center.y * factor, -center.z * factor); model.rotation.y = Math.PI / 2; model.visible = false;
    model.traverse((node) => { if (node.isMesh) { node.castShadow = true; } });
    fishMesh.add(model); loadedFish.set(fishId, model);
    if (gltf.animations.length) { const mixer = new THREE.AnimationMixer(model); mixer.clipAction(gltf.animations[0]).play(); fishMixers.push(mixer); }
  }, undefined, () => {}));
  function showFishModel(fishId) { fallbackFish.visible = !loadedFish.has(fishId); loadedFish.forEach((model, id) => { model.visible = id === fishId; }); }

  // Стайка малька и пузырьки
  const minnows = []; const minnowGeometry = new THREE.ConeGeometry(.08, .34, 5);
  for (let i = 0; i < 14; i += 1) { const minnow = new THREE.Mesh(minnowGeometry, mat(0x9fd3c2, .6)); minnow.rotation.z = Math.PI / 2; scene.add(minnow); minnows.push({ mesh: minnow, radius: random(3, 9), speed: random(.18, .42) * (Math.random() < .5 ? -1 : 1), offset: random(0, 6.28), depth: random(-2.6, -1), center: new THREE.Vector3(random(-8, 8), 0, random(-12, -2)) }); }
  const bubbles = []; for (let i = 0; i < 24; i += 1) { const bubble = new THREE.Mesh(new THREE.SphereGeometry(random(.025, .09), 8, 6), new THREE.MeshBasicMaterial({ color: 0xbce8df, transparent: true, opacity: .45 })); bubble.position.set(random(-16, 16), random(-5, 0), random(-22, 2)); scene.add(bubble); bubbles.push(bubble); }

  // Камера: перетаскивание + тряска на рывке
  const orbit = { dragging: false, x: 0, y: 0, yaw: 0, pitch: 0 };
  view.addEventListener('pointerdown', (event) => { orbit.dragging = true; orbit.x = event.clientX; orbit.y = event.clientY; if (phase === 'trophy') trophyRot.spin = false; if (phase === 'bite') startFight(); });
  view.addEventListener('pointermove', (event) => {
    if (!orbit.dragging) return;
    if (phase === 'trophy') { trophyRot.yaw += (event.clientX - orbit.x) * .012; trophyRot.pitch = clamp(trophyRot.pitch + (event.clientY - orbit.y) * .008, -1.1, 1.1); }
    else { orbit.yaw = clamp(orbit.yaw + (event.clientX - orbit.x) * .003, -.55, .55); orbit.pitch = clamp(orbit.pitch + (event.clientY - orbit.y) * .002, -.25, .22); }
    orbit.x = event.clientX; orbit.y = event.clientY;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((event) => view.addEventListener(event, () => { orbit.dragging = false; }));
  function resize() { const rect = view.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix(); }

  // Состояние анимаций
  let prevPhase = phase;
  let castProgress = 1;      // 0..1 полёт поплавка после заброса
  let castSwing = 0;         // замах удилища
  let biteShake = 0;         // подёргивание поплавка
  let rodFlex = 0;           // сглаженный изгиб
  let shake = 0;             // тряска камеры
  let leapTime = -1;         // анимация выведенной рыбы
  let lastRush = false;
  let trophyShow = 0;
  const bobPosition = new THREE.Vector3().copy(BOB_TARGET);
  const fishTarget = new THREE.Vector3(4, -3.6, -6);
  const linePoints = new Array(LINE_SEGMENTS + 1).fill(0).map(() => new THREE.Vector3());

  function onPhaseChange(next, previous) {
    if (next === 'waiting') { castProgress = 0; castSwing = 1; }
    if (next === 'bite') { biteShake = 1; }
    if (next === 'fight' && previous === 'bite') { shake = .6; spawnSplash(bobPosition, 1.2, 12); }
    if (next === 'trophy') { trophyShow = 0; spawnSplash(new THREE.Vector3(2.2, -.4, -3), 1.6, 16); }
    if (next === 'result') { leapTime = 0; }
    if (next === 'ready' && previous === 'fight') { spawnRipple(fishMesh.position, 1.4, 1); }
  }

  function updateBobber(seconds, dt) {
    const active = phase === 'waiting' || phase === 'bite';
    bobber.visible = active || castProgress < 1;
    rodBend.getWorldPosition(tipWorld); tipWorld.copy(rodTipAnchor.getWorldPosition(new THREE.Vector3()));
    if (castProgress < 1) {
      castProgress = Math.min(1, castProgress + dt * 1.6);
      const t = castProgress;
      bobPosition.lerpVectors(tipWorld, BOB_TARGET, t);
      bobPosition.y += Math.sin(t * Math.PI) * 3.4; // дуга полёта
      bobber.rotation.z = Math.sin(t * 9) * .5 * (1 - t);
      if (castProgress >= 1) spawnSplash(BOB_TARGET, 1, 12);
    } else if (active) {
      const drift = new THREE.Vector3(BOB_TARGET.x + Math.sin(seconds * .8) * .18, 0, BOB_TARGET.z + Math.cos(seconds * .6) * .14);
      const wave = waveAt(drift.x, drift.z, seconds);
      let y = -.45 + wave * .9 + Math.sin(seconds * 2.4) * .03;
      if (phase === 'bite') {
        biteShake = Math.min(1, biteShake + dt * 2);
        const dip = Math.abs(Math.sin(seconds * 7.5)) * .42 * biteShake;
        y -= dip;
        bobber.rotation.z = Math.sin(seconds * 11) * .3 * biteShake;
        if (Math.sin(seconds * 7.5) > .97) spawnRipple(bobPosition, .7, .7);
      } else {
        biteShake = 0; bobber.rotation.z = Math.sin(seconds * 1.7) * .07;
      }
      bobPosition.set(drift.x, y, drift.z);
      if (Math.sin(seconds * .9) > .995) spawnRipple(bobPosition, .5, 1.4);
    }
    bobber.position.copy(bobPosition);
    bobTop.material.color.set(phase === 'bite' ? 0xf05c4e : 0xee7e58);
  }

  function updateLine(seconds) {
    const from = tipWorld;
    const to = phase === 'fight' ? new THREE.Vector3(fishMesh.position.x, Math.min(-.1, fishMesh.position.y + 1.1), fishMesh.position.z) : bobPosition;
    const tight = phase === 'fight' ? clamp(tension / 100, 0, 1) : .15;
    const sag = (1 - tight) * from.distanceTo(to) * .12 + .05;
    const jitter = phase === 'fight' && rushing ? .06 : 0;
    for (let i = 0; i <= LINE_SEGMENTS; i += 1) {
      const t = i / LINE_SEGMENTS;
      const point = linePoints[i];
      point.lerpVectors(from, to, t);
      point.y -= Math.sin(t * Math.PI) * sag;
      if (jitter) { point.x += Math.sin(seconds * 40 + i) * jitter; point.y += Math.cos(seconds * 37 + i) * jitter; }
    }
    line.geometry.setFromPoints(linePoints);
    line.material.color.set(tight > .8 ? 0xffd5c2 : 0xf2e5bd);
  }

  function updateFish(seconds, dt) {
    if (phase === 'fight' && currentFish) {
      fishMesh.visible = true; showFishModel(currentFish.id);
      const closeness = 1 - clamp(fishDistance / 100, 0, 1);      // 0 далеко → 1 у бере��а
      const lateral = rushing ? 4.4 : 2.1;
      const speed = rushing ? 2.4 : 1;
      fishTarget.set(
        1.6 + Math.sin(seconds * .9 * speed) * lateral,
        -3.8 + closeness * 2.4 + Math.sin(seconds * 1.7 * speed) * .3,
        -13 + closeness * 9 + Math.cos(seconds * .6 * speed) * 1.4,
      );
      fishMesh.position.lerp(fishTarget, Math.min(1, dt * (rushing ? 4.5 : 2.4)));
      const bank = Math.sin(seconds * 1.4 * speed) * (rushing ? .5 : .22);
      fishMesh.rotation.z += (bank - fishMesh.rotation.z) * Math.min(1, dt * 5);
      fishMesh.rotation.y = Math.atan2(fishTarget.x - fishMesh.position.x, fishTarget.z - fishMesh.position.z) * .35;
      const scale = .8 + closeness * .45;
      fishMesh.scale.setScalar(scale);
      if (rushing && Math.random() < dt * 8) spawnRipple(fishMesh.position, .8, .9);
      if (fishMesh.position.y > -1.2 && Math.random() < dt * 6) spawnSplash(new THREE.Vector3(fishMesh.position.x, -.4, fishMesh.position.z), .7, 4);
    } else if (phase === 'trophy' && pendingCatch) {
      // Трофей перед камерой — можно крутить пальцем.
      fishMesh.visible = true; showFishModel(pendingCatch.id);
      if (trophyRot.spin) trophyRot.yaw += dt * .55;
      trophyShow = Math.min(1, trophyShow + dt * 2.2);
      const ease = 1 - Math.pow(1 - trophyShow, 3);
      fishMesh.position.set(4.75, 3.36 + Math.sin(seconds * 1.2) * .06, 6.1);
      fishMesh.rotation.set(trophyRot.pitch, trophyRot.yaw, Math.sin(seconds * .9) * .05);
      const big = 1.15 + clamp((pendingCatch.weight - .3) / 9, 0, 1) * .75;
      fishMesh.scale.setScalar(big * (.35 + ease * .65));
    } else if (leapTime >= 0) {
      // Выведенная рыба выпрыгивает из воды и уходит в садок
      leapTime += dt;
      const t = leapTime / 1.5;
      if (t >= 1) { leapTime = -1; fishMesh.visible = false; }
      else {
        fishMesh.visible = true;
        fishMesh.position.set(1.4 - t * 2.4, -1.4 + Math.sin(t * Math.PI) * 3.2, -3.4 + t * 5.6);
        fishMesh.rotation.z = t * 5.2; fishMesh.rotation.y = t * 1.4;
        fishMesh.scale.setScalar(1.25 - t * .35);
        if (t < .12) spawnSplash(new THREE.Vector3(fishMesh.position.x, -.4, fishMesh.position.z), 1.5, 14);
      }
    } else {
      fishMesh.visible = false; fishMesh.rotation.z = 0;
    }
    const tailSpeed = phase === 'fight' ? (rushing ? .034 : .02) : .012;
    fishMixers.forEach((mixer) => mixer.update(tailSpeed));
  }

  function updateEffects(seconds, dt) {
    for (const entry of ripples) {
      if (entry.life <= 0) continue;
      entry.life -= dt;
      const progress = 1 - entry.life / entry.max;
      entry.mesh.scale.setScalar((.3 + progress * 2.2) * entry.scale);
      entry.mesh.material.opacity = Math.max(0, .55 * (1 - progress));
      if (entry.life <= 0) entry.mesh.visible = false;
    }
    for (const drop of droplets) {
      if (drop.life <= 0) continue;
      drop.life -= dt;
      drop.velocity.y -= 9.8 * dt;
      drop.mesh.position.addScaledVector(drop.velocity, dt);
      drop.mesh.material.opacity = Math.max(0, drop.life * 1.6);
      if (drop.life <= 0 || drop.mesh.position.y < -.6) { drop.life = 0; drop.mesh.visible = false; }
    }
    for (const item of swayables) item.node.rotation.z = Math.sin(seconds * .8 + item.phase) * item.amp;
    for (const cloud of clouds) { cloud.position.x += dt * .35; if (cloud.position.x > 46) cloud.position.x = -46; }
    for (const fry of minnows) {
      const angle = seconds * fry.speed + fry.offset;
      fry.mesh.position.set(fry.center.x + Math.cos(angle) * fry.radius, fry.depth + Math.sin(seconds * 1.4 + fry.offset) * .12, fry.center.z + Math.sin(angle) * fry.radius);
      fry.mesh.rotation.y = -angle;
    }
    for (const bubble of bubbles) { bubble.position.y += .002 + Math.sin(seconds + bubble.position.x) * .0004; if (bubble.position.y > -.5) { bubble.position.y = -5; spawnRipple(bubble.position, .25, .8); } }
  }

  let lastRender = performance.now();
  function render(time) {
    const seconds = time / 1000;
    const dt = Math.min(.05, (time - lastRender) / 1000); lastRender = time;

    if (phase !== prevPhase) { onPhaseChange(phase, prevPhase); prevPhase = phase; }
    if (phase === 'fight' && rushing && !lastRush) shake = Math.max(shake, .8);
    lastRush = phase === 'fight' && rushing;

    // Волны
    for (let i = 0; i < waterPos.count; i += 1) { const [x, z] = waterBase[i]; waterPos.setZ(i, waveAt(x, z, seconds)); }
    waterPos.needsUpdate = true; water.geometry.computeVertexNormals();

    if (phase === 'bite') $('#bite-fill').style.width = `${clamp((performance.now() - biteAt) / 1500 * 100, 0, 100)}%`;

    // Удилище: замах при забросе + изгиб от натяжения
    castSwing = Math.max(0, castSwing - dt * 2.4);
    const targetFlex = phase === 'fight' ? clamp(tension / 100, 0, 1) : phase === 'bite' ? .18 : .05;
    rodFlex += (targetFlex - rodFlex) * Math.min(1, dt * 6);
    rod.rotation.z = -.1 - Math.sin(castSwing * Math.PI) * .85 + rodFlex * .12;
    rod.rotation.x = -.18 - rodFlex * .22 + Math.sin(castSwing * Math.PI) * .3;
    rodBend.rotation.z = -rodFlex * .75 + (phase === 'fight' && rushing ? Math.sin(seconds * 18) * .06 : 0);
    rodBend.rotation.x = -rodFlex * .35;

    updateBobber(seconds, dt);
    updateFish(seconds, dt);
    updateLine(seconds);
    updateEffects(seconds, dt);

    // Камера
    shake = Math.max(0, shake - dt * 1.6);
    if (phase === 'trophy') {
      camera.position.set(8, 5.8, 13); camera.lookAt(0, -.2, -4);
      renderer.render(scene, camera); requestAnimationFrame(render); return;
    }
    const zoom = phase === 'fight' ? 1.5 : 0;
    const jolt = shake * .18;
    camera.position.x = 8 + orbit.yaw * 7 - zoom * .6 + Math.sin(seconds * 31) * jolt;
    camera.position.y = 5.8 + orbit.pitch * 5 - zoom * .35 + Math.cos(seconds * 27) * jolt;
    camera.position.z = 13 - zoom;
    camera.lookAt(0 + Math.sin(seconds * 23) * jolt * .5, -.2, -4);

    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  $('#cast-button').addEventListener('click', cast); $('#reel-button').addEventListener('pointerdown', () => { reeling = true; }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((event) => $('#reel-button').addEventListener(event, () => { reeling = false; }));
  document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.nav-button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); if (button.dataset.panel !== 'water') openPanel(button.dataset.panel); }));
  $('#trophy-keep').addEventListener('click', keepFish); $('#trophy-release').addEventListener('click', releaseFish);
  $('#close-modal').addEventListener('click', closeModal); $('#modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'modal-backdrop') closeModal(); });
  window.addEventListener('resize', resize); resize(); updateHud(); setPhase('ready'); requestAnimationFrame(render);
})();
