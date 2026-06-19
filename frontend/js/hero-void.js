"use strict";

(() => {
  window.initVoltVoidModel = function initVoltVoidModel(stage, canvas) {
    if (!stage || !canvas || typeof THREE === "undefined") return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      return null;
    }

    const DPR = Math.min(window.devicePixelRatio || 1, 1.8);
    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    camera.position.set(0, 1.75, 8.85);
    camera.lookAt(0, 0.18, 0);

    const root = new THREE.Group();
    const rig = new THREE.Group();
    const orbitGroup = new THREE.Group();
    const floaters = new THREE.Group();
    scene.add(root);
    root.add(orbitGroup, rig, floaters);

    scene.add(new THREE.HemisphereLight(0xdff7ff, 0x02040a, 0.65));
    const key = new THREE.DirectionalLight(0xf3fbff, 1.45);
    key.position.set(4.8, 7.2, 5.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4c4, 0.72);
    rim.position.set(-5.2, 2.8, -4.8);
    scene.add(rim);
    const pulseLight = new THREE.PointLight(0xd8f8ff, 1.7, 9.5);
    pulseLight.position.set(0, 1.1, 1.1);
    scene.add(pulseLight);

    const mats = {
      shell: new THREE.MeshStandardMaterial({ color: 0x071017, metalness: 0.82, roughness: 0.34 }),
      side: new THREE.MeshStandardMaterial({ color: 0x0b151d, metalness: 0.72, roughness: 0.44 }),
      fin: new THREE.MeshStandardMaterial({ color: 0x101e27, metalness: 0.78, roughness: 0.28 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xbfefff,
        metalness: 0,
        roughness: 0.08,
        transparent: true,
        opacity: 0.11,
        transmission: 0.36,
        depthWrite: false,
      }),
      rail: new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.18, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({
        color: 0xdffcff,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      dimGlow: new THREE.MeshBasicMaterial({
        color: 0x8eb8c8,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      darkGlow: new THREE.MeshBasicMaterial({ color: 0x23333d, transparent: true, opacity: 0.34, depthWrite: false }),
    };

    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const cyl = (r, h, mat, seg = 40) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
    const sphere = (r, mat, seg = 32) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg / 2), mat);

    const board = box(4.9, 0.16, 3.15, mats.shell);
    board.position.y = -0.14;
    rig.add(board);

    const cover = box(5.35, 0.035, 3.55, mats.glass);
    cover.position.y = 0.02;
    rig.add(cover);

    const core = box(0.92, 0.14, 0.92, mats.glow.clone());
    core.position.set(0, 0.18, 0.05);
    rig.add(core);

    const coreFrame = box(1.28, 0.08, 1.28, mats.rail);
    coreFrame.position.set(0, 0.13, 0.05);
    rig.add(coreFrame);

    const coreTower = new THREE.Group();
    const coreGlass = cyl(0.42, 1.18, mats.glass, 56);
    coreGlass.position.y = 0.86;
    coreTower.add(coreGlass);
    const coreSpine = cyl(0.18, 1.02, mats.glow.clone(), 44);
    coreSpine.position.y = 0.86;
    coreTower.add(coreSpine);
    const capTop = sphere(0.18, mats.glow.clone(), 32);
    capTop.position.y = 1.37;
    coreTower.add(capTop);
    const capBottom = sphere(0.18, mats.dimGlow.clone(), 32);
    capBottom.position.y = 0.35;
    coreTower.add(capBottom);
    const coreRings = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48 + i * 0.045, 0.006, 8, 78), (i % 2 ? mats.dimGlow : mats.rail).clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.48 + i * 0.24;
      coreTower.add(ring);
      coreRings.push(ring);
    }
    coreTower.position.set(0, 0.05, 0.05);
    rig.add(coreTower);

    const gpu = box(3.3, 0.22, 0.66, mats.side);
    gpu.position.set(0.16, 0.28, -0.82);
    rig.add(gpu);

    const gpuLight = box(2.55, 0.035, 0.055, mats.glow.clone());
    gpuLight.position.set(0.28, 0.42, -1.18);
    rig.add(gpuLight);

    const finGroup = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const fin = box(0.035, 0.44 + (i % 3) * 0.05, 0.58, mats.fin);
      fin.position.set(-2.05 + i * 0.315, 0.46, 1.32);
      fin.rotation.z = -0.03;
      finGroup.add(fin);
    }
    rig.add(finGroup);

    const ramGroup = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const stick = box(1.9, 0.12, 0.12, mats.side);
      stick.position.set(-0.1 + i * 0.12, 0.30, 0.88 + i * 0.18);
      stick.rotation.y = 0.02;
      ramGroup.add(stick);
      const line = box(1.66, 0.025, 0.025, mats.dimGlow);
      line.position.set(stick.position.x, 0.385, stick.position.z);
      ramGroup.add(line);
    }
    rig.add(ramGroup);

    const fanGroup = new THREE.Group();
    for (const x of [-1.65, 1.72]) {
      const fan = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 10, 44), mats.rail);
      ring.rotation.x = Math.PI / 2;
      fan.add(ring);
      const hub = cyl(0.07, 0.025, mats.dimGlow, 24);
      hub.rotation.x = Math.PI / 2;
      fan.add(hub);
      for (let i = 0; i < 6; i++) {
        const blade = box(0.22, 0.018, 0.055, mats.darkGlow);
        blade.position.x = Math.cos(i * Math.PI / 3) * 0.13;
        blade.position.z = Math.sin(i * Math.PI / 3) * 0.13;
        blade.rotation.y = i * Math.PI / 3;
        fan.add(blade);
      }
      fan.position.set(x, 0.31, -0.82);
      fan.userData.spin = true;
      fanGroup.add(fan);
    }
    rig.add(fanGroup);

    const edgePins = new THREE.Group();
    for (let i = 0; i < 15; i++) {
      const pinA = box(0.035, 0.09, 0.20, mats.rail);
      pinA.position.set(-2.25 + i * 0.32, 0.02, 1.74);
      edgePins.add(pinA);
      const pinB = box(0.035, 0.09, 0.20, mats.rail);
      pinB.position.set(-2.25 + i * 0.32, 0.02, -1.74);
      edgePins.add(pinB);
    }
    rig.add(edgePins);

    const scan = box(5.8, 0.015, 0.045, mats.glow.clone());
    scan.position.y = 0.54;
    rig.add(scan);

    rig.rotation.x = -0.52;
    rig.rotation.y = -0.38;
    rig.rotation.z = 0.04;

    const orbitMat = new THREE.MeshBasicMaterial({
      color: 0xcaf7ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbitA = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.006, 8, 140), orbitMat);
    orbitA.scale.set(1.35, 0.42, 1);
    orbitA.rotation.set(Math.PI / 2.75, 0.14, -0.18);
    orbitGroup.add(orbitA);

    const orbitB = new THREE.Mesh(new THREE.TorusGeometry(2.16, 0.005, 8, 120), orbitMat.clone());
    orbitB.material.opacity = 0.11;
    orbitB.scale.set(0.78, 1.22, 1);
    orbitB.rotation.set(0.22, Math.PI / 2.25, 0.32);
    orbitGroup.add(orbitB);

    const orbitC = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.004, 8, 96), orbitMat.clone());
    orbitC.material.opacity = 0.08;
    orbitC.rotation.set(Math.PI / 2.15, 0.42, 0.56);
    orbitGroup.add(orbitC);

    const arcMat = new THREE.LineBasicMaterial({
      color: 0xcaf7ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
    });
    const makeArc = (radius, y, z, start, end) => {
      const points = [];
      for (let i = 0; i <= 54; i++) {
        const p = i / 54;
        const a = start + (end - start) * p;
        points.push(new THREE.Vector3(Math.cos(a) * radius, y + Math.sin(p * Math.PI) * 0.44, z + Math.sin(a) * radius * 0.34));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      return new THREE.Line(geo, arcMat.clone());
    };
    const arcA = makeArc(2.92, 0.20, -0.10, -2.78, -0.35);
    const arcB = makeArc(2.62, 0.60, 0.08, 0.30, 2.62);
    arcB.material.opacity = 0.10;
    orbitGroup.add(arcA, arcB);

    for (let i = 0; i < 16; i++) {
      const chip = box(0.08 + Math.random() * 0.10, 0.028, 0.18 + Math.random() * 0.22, Math.random() > 0.5 ? mats.side : mats.darkGlow);
      const a = Math.random() * Math.PI * 2;
      const r = 2.1 + Math.random() * 1.25;
      chip.position.set(Math.cos(a) * r, -0.15 + Math.random() * 0.9, Math.sin(a) * r * 0.54);
      chip.rotation.set(-0.4 + Math.random() * 0.8, a, -0.4 + Math.random() * 0.8);
      chip.userData.baseY = chip.position.y;
      chip.userData.speed = 0.4 + Math.random() * 0.9;
      floaters.add(chip);
    }

    const particleCount = 180;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 9.5;
      particlePositions[i * 3 + 1] = (Math.random() - 0.48) * 5.4;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 5.6;
    }
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particlesGeo,
      new THREE.PointsMaterial({
        color: 0xcff8ff,
        transparent: true,
        opacity: 0.28,
        size: 0.024,
        sizeAttenuation: true,
        depthWrite: false,
      })
    );
    scene.add(particles);

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (event) => {
      const r = stage.getBoundingClientRect();
      pointer.tx = ((event.clientX - r.left) / (r.width || 1) - 0.5) * 2;
      pointer.ty = ((event.clientY - r.top) / (r.height || 1) - 0.5) * 2;
    };
    const onLeave = () => {
      pointer.tx = 0;
      pointer.ty = 0;
    };
    stage.addEventListener("pointermove", onMove, { passive: true });
    stage.addEventListener("pointerleave", onLeave);

    let w = 0;
    let h = 0;
    let stageScale = 0.92;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.floor(rect.width));
      const nh = Math.max(1, Math.floor(rect.height));
      stageScale = nw < 460 ? 0.74 : nw < 620 ? 0.82 : 0.92;
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      if (!canvas.isConnected) return;
      raf = requestAnimationFrame(loop);
      resize();

      const t = clock.getElapsedTime();
      const dt = Math.min(0.04, clock.getDelta());
      const scroll = Number.parseFloat(stage.style.getPropertyValue("--void-scroll")) || 0;
      pointer.x += (pointer.tx - pointer.x) * 0.055;
      pointer.y += (pointer.ty - pointer.y) * 0.055;

      root.rotation.y = pointer.x * 0.16 + Math.sin(t * 0.26) * 0.035;
      root.rotation.x = -pointer.y * 0.09 + Math.sin(t * 0.18) * 0.018;
      root.position.y = 0.06 - scroll * 0.16 + Math.sin(t * 0.42) * 0.035;
      root.scale.setScalar(stageScale * (1 + scroll * 0.02));

      rig.rotation.y = -0.38 + Math.sin(t * 0.32) * 0.075;
      rig.rotation.z = 0.04 + Math.sin(t * 0.21) * 0.025;
      scan.position.z = -1.78 + ((t * 0.42) % 3.56);
      scan.material.opacity = 0.26 + Math.sin(t * 2.0) * 0.10;

      orbitA.rotation.z += dt * 0.14;
      orbitB.rotation.x += dt * 0.10;
      orbitC.rotation.y -= dt * 0.12;
      coreTower.rotation.y = Math.sin(t * 0.22) * 0.08;
      coreRings.forEach((ring, index) => {
        ring.rotation.z += dt * (0.22 + index * 0.06) * (index % 2 ? -1 : 1);
        ring.material.opacity = 0.10 + Math.sin(t * 1.15 + index) * 0.035 + index * 0.018;
      });
      fanGroup.children.forEach((fan) => { if (fan.userData.spin) fan.rotation.y += dt * 4.8; });
      floaters.children.forEach((chip, index) => {
        chip.position.y = chip.userData.baseY + Math.sin(t * chip.userData.speed + index) * 0.05;
        chip.rotation.y += dt * 0.12;
      });

      core.material.opacity = 0.60 + Math.sin(t * 1.8) * 0.12;
      coreSpine.material.opacity = 0.54 + Math.sin(t * 1.65) * 0.12;
      capTop.material.opacity = 0.50 + Math.sin(t * 1.65 + 0.6) * 0.10;
      pulseLight.intensity = 1.28 + Math.sin(t * 1.45) * 0.38;
      particles.rotation.y += dt * 0.018;
      particles.rotation.x = Math.sin(t * 0.08) * 0.035;

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      renderer.dispose();
      particlesGeo.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose && m.dispose());
          else obj.material.dispose && obj.material.dispose();
        }
      });
    };
  };
})();
