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
    renderer.toneMappingExposure = 1.18;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80);
    camera.position.set(0, 0.35, 8.6);
    camera.lookAt(0, 0.25, 0);

    const root = new THREE.Group();
    const rig = new THREE.Group();
    const orbitGroup = new THREE.Group();
    const dustGroup = new THREE.Group();
    scene.add(root);
    root.add(orbitGroup, rig, dustGroup);

    scene.add(new THREE.HemisphereLight(0xe6fbff, 0x02040a, 0.72));
    const key = new THREE.DirectionalLight(0xf4fbff, 1.55);
    key.position.set(3.8, 5.8, 4.8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb8c9, 0.94);
    rim.position.set(-4.5, 2.4, -3.8);
    scene.add(rim);
    const pulseLight = new THREE.PointLight(0xd8f8ff, 1.8, 8.5);
    pulseLight.position.set(0.16, 0.35, 1.15);
    scene.add(pulseLight);

    const mats = {
      caseOuter: new THREE.MeshStandardMaterial({ color: 0x04080d, metalness: 0.76, roughness: 0.36 }),
      caseEdge: new THREE.MeshStandardMaterial({ color: 0x0c1720, metalness: 0.82, roughness: 0.26 }),
      inner: new THREE.MeshStandardMaterial({ color: 0x0b151c, metalness: 0.62, roughness: 0.45 }),
      board: new THREE.MeshStandardMaterial({ color: 0x07141b, metalness: 0.35, roughness: 0.58 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x132631, metalness: 0.86, roughness: 0.28 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xc8f5ff,
        metalness: 0,
        roughness: 0.08,
        transparent: true,
        opacity: 0.14,
        transmission: 0.28,
        depthWrite: false,
      }),
      glassEdge: new THREE.MeshBasicMaterial({ color: 0xcaf7ff, transparent: true, opacity: 0.16, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({
        color: 0xe7fdff,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      dimGlow: new THREE.MeshBasicMaterial({
        color: 0x8fb9c8,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      line: new THREE.LineBasicMaterial({
        color: 0xcaf7ff,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
      }),
    };

    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const cyl = (r, h, mat, seg = 48) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);

    const tower = new THREE.Group();
    rig.add(tower);

    const caseBack = box(2.05, 3.55, 1.18, mats.caseOuter);
    caseBack.position.set(0, 0.05, -0.05);
    tower.add(caseBack);

    const sideGlass = box(1.78, 3.18, 0.035, mats.glass);
    sideGlass.position.set(0.07, 0.05, 0.58);
    tower.add(sideGlass);

    const leftRail = box(0.065, 3.68, 1.26, mats.caseEdge);
    leftRail.position.set(-1.1, 0.05, 0);
    tower.add(leftRail);

    const rightRail = box(0.065, 3.68, 1.26, mats.caseEdge);
    rightRail.position.set(1.1, 0.05, 0);
    tower.add(rightRail);

    const topRail = box(2.18, 0.08, 1.28, mats.caseEdge);
    topRail.position.set(0, 1.88, 0);
    tower.add(topRail);

    const bottomRail = box(2.18, 0.08, 1.28, mats.caseEdge);
    bottomRail.position.set(0, -1.78, 0);
    tower.add(bottomRail);

    const frontVent = box(0.10, 3.14, 1.08, mats.metal);
    frontVent.position.set(-0.98, 0.03, 0.20);
    tower.add(frontVent);

    const motherboard = box(0.92, 2.15, 0.055, mats.board);
    motherboard.position.set(0.36, 0.24, 0.63);
    tower.add(motherboard);

    const cpuGlow = box(0.34, 0.34, 0.035, mats.glow.clone());
    cpuGlow.position.set(0.26, 0.56, 0.69);
    tower.add(cpuGlow);

    const cpuFrame = box(0.50, 0.50, 0.028, mats.glassEdge);
    cpuFrame.position.set(0.26, 0.56, 0.71);
    tower.add(cpuFrame);

    const ramBars = [];
    for (let i = 0; i < 4; i++) {
      const ram = box(0.055, 0.76, 0.045, i % 2 ? mats.metal : mats.inner);
      ram.position.set(0.66 + i * 0.07, 0.58, 0.72);
      tower.add(ram);
      const ramLight = box(0.018, 0.66, 0.025, mats.dimGlow.clone());
      ramLight.position.set(ram.position.x, ram.position.y, 0.755);
      tower.add(ramLight);
      ramBars.push(ramLight);
    }

    const gpu = box(1.28, 0.32, 0.26, mats.metal);
    gpu.position.set(0.34, -0.55, 0.74);
    tower.add(gpu);

    const gpuLight = box(0.98, 0.035, 0.035, mats.glow.clone());
    gpuLight.position.set(0.34, -0.38, 0.90);
    tower.add(gpuLight);

    const psu = box(1.28, 0.42, 0.42, mats.inner);
    psu.position.set(0.25, -1.30, 0.50);
    tower.add(psu);

    const fanGroup = new THREE.Group();
    const fanCenters = [
      [-0.97, 0.98, 0.78],
      [-0.97, 0.08, 0.78],
      [-0.97, -0.82, 0.78],
    ];
    for (const [x, y, z] of fanCenters) {
      const fan = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.018, 10, 72), mats.glassEdge.clone());
      ring.material.opacity = 0.22;
      fan.add(ring);

      const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.006, 8, 48), mats.dimGlow.clone());
      innerRing.material.opacity = 0.20;
      fan.add(innerRing);

      const hub = cyl(0.054, 0.018, mats.dimGlow.clone(), 28);
      hub.rotation.x = Math.PI / 2;
      fan.add(hub);

      for (let i = 0; i < 7; i++) {
        const blade = box(0.18, 0.030, 0.014, mats.dimGlow.clone());
        blade.material.opacity = 0.18;
        blade.position.x = Math.cos(i * Math.PI * 2 / 7) * 0.095;
        blade.position.y = Math.sin(i * Math.PI * 2 / 7) * 0.095;
        blade.rotation.z = i * Math.PI * 2 / 7 + 0.48;
        fan.add(blade);
      }
      fan.position.set(x, y, z);
      fan.userData.spin = true;
      fanGroup.add(fan);
    }
    tower.add(fanGroup);

    const portLights = [];
    for (let i = 0; i < 7; i++) {
      const slit = box(0.46, 0.018, 0.024, mats.dimGlow.clone());
      slit.position.set(0.30, -1.08 + i * 0.09, 0.82);
      slit.material.opacity = 0.10 + i * 0.008;
      tower.add(slit);
      portLights.push(slit);
    }

    const feet = [
      [-0.72, -1.98, -0.42],
      [0.72, -1.98, -0.42],
      [-0.72, -1.98, 0.44],
      [0.72, -1.98, 0.44],
    ];
    for (const [x, y, z] of feet) {
      const foot = box(0.36, 0.07, 0.18, mats.caseEdge);
      foot.position.set(x, y, z);
      tower.add(foot);
    }

    const cableMat = mats.line.clone();
    cableMat.opacity = 0.10;
    const cablePoints = [
      new THREE.Vector3(-0.10, -0.58, 0.86),
      new THREE.Vector3(-0.05, -0.05, 0.96),
      new THREE.Vector3(0.28, 0.56, 0.88),
    ];
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cablePoints), cableMat);
    tower.add(cable);

    tower.rotation.y = -0.28;
    tower.rotation.x = 0.06;
    tower.rotation.z = -0.025;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 80),
      new THREE.MeshBasicMaterial({
        color: 0x9fd5e4,
        transparent: true,
        opacity: 0.055,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.12, -2.16, 0.05);
    shadow.scale.set(1.7, 0.34, 1);
    rig.add(shadow);

    const orbitMat = new THREE.MeshBasicMaterial({
      color: 0xcaf7ff,
      transparent: true,
      opacity: 0.105,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const orbitA = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.004, 8, 140), orbitMat);
    orbitA.scale.set(0.88, 1.40, 1);
    orbitA.rotation.set(0.18, Math.PI / 2.2, 0.10);
    orbitGroup.add(orbitA);

    const orbitB = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.004, 8, 140), orbitMat.clone());
    orbitB.material.opacity = 0.075;
    orbitB.scale.set(1.42, 0.28, 1);
    orbitB.rotation.set(Math.PI / 2.72, 0.06, -0.18);
    orbitGroup.add(orbitB);

    const traceMat = mats.line.clone();
    traceMat.opacity = 0.13;
    const makeTrace = (radius, y, start, end) => {
      const points = [];
      for (let i = 0; i <= 64; i++) {
        const p = i / 64;
        const a = start + (end - start) * p;
        points.push(new THREE.Vector3(Math.cos(a) * radius, y + Math.sin(p * Math.PI) * 0.20, Math.sin(a) * radius * 0.30));
      }
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), traceMat.clone());
    };
    const traceA = makeTrace(2.56, 0.32, -2.55, -0.30);
    const traceB = makeTrace(2.20, -0.96, 0.22, 2.52);
    traceB.material.opacity = 0.08;
    orbitGroup.add(traceA, traceB);

    for (let i = 0; i < 18; i++) {
      const shard = box(0.06 + Math.random() * 0.11, 0.020, 0.16 + Math.random() * 0.18, Math.random() > 0.45 ? mats.inner : mats.dimGlow.clone());
      if (shard.material.opacity !== undefined) shard.material.opacity = 0.16;
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 1.55;
      shard.position.set(Math.cos(a) * r, -1.0 + Math.random() * 2.5, Math.sin(a) * r * 0.45);
      shard.rotation.set(Math.random() * 0.8, a, Math.random() * 0.8);
      shard.userData.baseY = shard.position.y;
      shard.userData.speed = 0.35 + Math.random() * 0.8;
      dustGroup.add(shard);
    }

    const particleCount = 150;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 8.8;
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 5.6;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 5.4;
    }
    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particlesGeo,
      new THREE.PointsMaterial({
        color: 0xcff8ff,
        transparent: true,
        opacity: 0.24,
        size: 0.022,
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
    let stageScale = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.floor(rect.width));
      const nh = Math.max(1, Math.floor(rect.height));
      stageScale = nw < 430 ? 0.76 : nw < 620 ? 0.86 : 1.02;
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

      root.rotation.y = pointer.x * 0.12 + Math.sin(t * 0.23) * 0.030;
      root.rotation.x = -pointer.y * 0.07 + Math.sin(t * 0.18) * 0.012;
      root.position.y = -0.03 - scroll * 0.10 + Math.sin(t * 0.42) * 0.040;
      root.scale.setScalar(stageScale * (1 + scroll * 0.012));

      rig.rotation.y = Math.sin(t * 0.20) * 0.035;
      rig.rotation.z = Math.sin(t * 0.16) * 0.012;
      tower.rotation.y = -0.28 + Math.sin(t * 0.26) * 0.030;
      tower.rotation.z = -0.025 + Math.sin(t * 0.21) * 0.010;

      fanGroup.children.forEach((fan) => {
        if (fan.userData.spin) fan.rotation.z -= dt * 5.4;
      });
      ramBars.forEach((bar, index) => {
        bar.material.opacity = 0.13 + Math.sin(t * 1.6 + index * 0.8) * 0.045;
      });
      portLights.forEach((slit, index) => {
        slit.material.opacity = 0.08 + Math.sin(t * 1.25 + index * 0.4) * 0.025 + index * 0.006;
      });
      cpuGlow.material.opacity = 0.44 + Math.sin(t * 1.55) * 0.10;
      gpuLight.material.opacity = 0.34 + Math.sin(t * 1.32 + 0.8) * 0.08;
      pulseLight.intensity = 1.25 + Math.sin(t * 1.38) * 0.34;

      orbitA.rotation.z += dt * 0.10;
      orbitB.rotation.x += dt * 0.08;
      traceA.rotation.y += dt * 0.045;
      traceB.rotation.y -= dt * 0.035;
      dustGroup.children.forEach((shard, index) => {
        shard.position.y = shard.userData.baseY + Math.sin(t * shard.userData.speed + index) * 0.045;
        shard.rotation.y += dt * 0.10;
      });
      particles.rotation.y += dt * 0.016;
      particles.rotation.x = Math.sin(t * 0.08) * 0.030;

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
