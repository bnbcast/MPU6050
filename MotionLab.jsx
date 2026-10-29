import React, { useEffect, useRef, useState } from "react";
import Breadcrumb from "./Breadcrumb.jsx";

const axes = ["x", "y", "z"];
const colors = ["#ff7a7a", "#6ee7a0", "#74b9ff"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const radians = (degrees) => degrees * Math.PI / 180;
const wrap180 = (value) => ((value + 540) % 360) - 180;
const loadThree = () => new Promise((resolve, reject) => {
  if (window.THREE) return resolve(window.THREE);
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  script.onload = () => window.THREE ? resolve(window.THREE) : reject(new Error("Three.js unavailable"));
  script.onerror = reject;
  document.head.appendChild(script);
});

function MotionChart({ series, range, label }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "rgba(255,255,255,.2)";
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();
      series.forEach((values, axis) => {
        context.strokeStyle = colors[axis];
        context.lineWidth = 1.8;
        context.beginPath();
        values.forEach((value, index) => {
          const x = index / Math.max(1, values.length - 1) * width;
          const y = height / 2 - clamp(value, -range, range) / range * (height / 2 - 2);
          index ? context.lineTo(x, y) : context.moveTo(x, y);
        });
        context.stroke();
      });
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [series, range]);
  return <canvas ref={canvasRef} aria-label={label} />;
}

export default function MotionLab() {
  const viewRef = useRef(null);
  const stateRef = useRef({ x: 0, y: 0, z: 0, mode: "" });
  const previousRef = useRef({ x: 0, y: 0, z: 0 });
  const [pose, setPose] = useState({ x: 0, y: 0, z: 0 });
  const [mode, setMode] = useState("");
  const [readings, setReadings] = useState({ accel: [0, 0, 9.81], gyro: [0, 0, 0], temp: 24.7 });
  const [series, setSeries] = useState({ accel: [[], [], []], gyro: [[], [], []] });
  const [serial, setSerial] = useState([]);
  const [ledOn, setLedOn] = useState(false);
  const [logs, setLogs] = useState(["14:02:11  GET /api/status  200 OK", "14:02:12  GET /api/clients  200 OK", "14:02:16  GET /  200 OK"]);

  const updatePose = (next, nextMode = "") => {
    const normalized = { x: clamp(next.x, -180, 180), y: clamp(next.y, -180, 180), z: wrap180(next.z) };
    stateRef.current = { ...normalized, mode: nextMode };
    setPose(normalized);
    setMode(nextMode);
  };
  const setAxis = (axis, value) => updatePose({ ...stateRef.current, [axis]: Number(value) });

  useEffect(() => {
    let renderer;
    let frame;
    let resize;
    let pointerHandlers = [];
    let mounted = true;
    loadThree().then((THREE) => {
      const container = viewRef.current;
      if (!mounted || !container) return;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.appendChild(renderer.domElement);
      let pointer = null;
      const onPointerDown = (event) => {
        pointer = [event.clientX, event.clientY];
        renderer.domElement.setPointerCapture(event.pointerId);
        renderer.domElement.style.cursor = "grabbing";
        stateRef.current.mode = "";
        setMode("");
      };
      const onPointerMove = (event) => {
        if (!pointer) return;
        const current = stateRef.current;
        updatePose({
          ...current,
          z: current.z + (event.clientX - pointer[0]) * 0.6,
          x: current.x + (event.clientY - pointer[1]) * 0.6,
        });
        pointer = [event.clientX, event.clientY];
      };
      const onPointerUp = () => {
        pointer = null;
        renderer.domElement.style.cursor = "grab";
      };
      renderer.domElement.style.cursor = "grab";
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);
      pointerHandlers = [["pointerdown", onPointerDown], ["pointermove", onPointerMove], ["pointerup", onPointerUp], ["pointercancel", onPointerUp]];
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
      camera.position.set(3.6, 2.8, 4.6);
      camera.lookAt(0, -0.1, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const light = new THREE.DirectionalLight(0xffffff, 0.9);
      light.position.set(3, 5, 4);
      scene.add(light);
      const board = new THREE.Group();
      scene.add(board);
      const mesh = (geometry, color) => new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1 }));
      board.add(mesh(new THREE.BoxGeometry(2.4, 0.12, 1.8), 0x2f7fd6));
      const chip = mesh(new THREE.BoxGeometry(0.62, 0.1, 0.62), 0x14181f);
      chip.position.set(0.1, 0.11, 0);
      board.add(chip);
      for (let index = 0; index < 8; index += 1) {
        const pin = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), 0xd9b44a);
        pin.position.set(-0.84 + index * 0.24, 0.05, 0.74);
        board.add(pin);
      }
      [[new THREE.Vector3(1, 0, 0), 0xff7a7a], [new THREE.Vector3(0, 0, -1), 0x6ee7a0], [new THREE.Vector3(0, 1, 0), 0x74b9ff]].forEach(([direction, color]) => board.add(new THREE.ArrowHelper(direction, new THREE.Vector3(0, 0.1, 0), 1.7, color, 0.22, 0.14)));
      scene.add(new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-2.1, 1.1, 0), 1.3, 0xffc857, 0.24, 0.16));
      const grid = new THREE.GridHelper(7, 14, 0x7fa8ff, 0x35539a);
      grid.position.y = -1.1;
      scene.add(grid);
      resize = () => {
        if (!container.clientWidth || !container.clientHeight) return;
        renderer.setSize(container.clientWidth, container.clientHeight);
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
      };
      const animate = () => {
        const current = stateRef.current;
        if (current.mode === "spin") {
          current.z = wrap180(current.z + 1.8);
          setPose({ x: current.x, y: current.y, z: current.z });
        } else if (current.mode === "shake") {
          const time = performance.now() / 1000;
          current.x = 18 * Math.sin(time * 14);
          current.y = 12 * Math.sin(time * 11 + 1);
          setPose({ x: current.x, y: current.y, z: current.z });
        }
        board.rotation.set(radians(current.x), radians(current.z), -radians(current.y), "YXZ");
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      resize();
      window.addEventListener("resize", resize);
      frame = requestAnimationFrame(animate);
    }).catch(() => {
      if (mounted && viewRef.current) viewRef.current.dataset.error = "Three.js could not load; controls and sensor simulation remain available.";
    });
    return () => {
      mounted = false;
      if (frame) cancelAnimationFrame(frame);
      if (resize) window.removeEventListener("resize", resize);
      if (renderer) {
        pointerHandlers.forEach(([event, handler]) => renderer.domElement.removeEventListener(event, handler));
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      const x = radians(current.x);
      const y = radians(current.y);
      const accel = [
        Math.sin(y) * Math.cos(x) * 9.81,
        -Math.sin(x) * 9.81,
        Math.cos(x) * Math.cos(y) * 9.81,
      ].map((value) => value + (Math.random() - 0.5) * 0.16);
      const previous = previousRef.current;
      const gyro = axes.map((axis) => (current[axis] - previous[axis]) * 10 + (Math.random() - 0.5) * 0.8);
      previousRef.current = { x: current.x, y: current.y, z: current.z };
      setReadings({ accel, gyro, temp: 24.7 + Math.sin(Date.now() / 12000) * 0.4 });
      const append = (old, values) => old.map((history, index) => [...history.slice(-98), values[index]]);
      setSeries((old) => ({ accel: append(old.accel, accel), gyro: append(old.gyro, gyro) }));
      setSerial((old) => [...old.slice(-9), `${new Date().toLocaleTimeString()}  A ${accel.map((v) => v.toFixed(2)).join(" ")}  G ${gyro.map((v) => v.toFixed(2)).join(" ")}`]);
    }, 100);
    return () => window.clearInterval(interval);
  }, []);

  const choosePreset = (preset) => {
    const presets = {
      flat: [{ x: 0, y: 0, z: 0 }, ""], tilt: [{ x: 45, y: 0, z: 0 }, ""],
      edge: [{ x: 90, y: 0, z: 0 }, ""], spin: [{ ...pose, x: 0, y: 0 }, "spin"],
      shake: [pose, "shake"],
    };
    updatePose(...presets[preset]);
  };
  const addLog = (message) => setLogs((current) => [...current.slice(-39), `${new Date().toLocaleTimeString()}  ${message}`]);

  return <div className="wrap">
    <header className="top"><Breadcrumb current="MPU-6050 + ESP32 Motion Lab" /><a href="#control-center">Explore Control Center ↓</a><a href="#tech-stack">Tech stack &amp; UI ↓</a></header>
    <h1>Watch an MPU-6050 feel gravity and spin</h1>
    <p className="lead">An ESP32 reads six motion channels and a temperature from the sensor over I²C. Tilt, spin, or shake the virtual board below and the Serial Monitor prints the same line format my sketch prints in the simulation.</p>
    <p className="status">Simulation running. The 3D view is a physics model, not measured data.</p>
    <div className="stage"><div>
      <div id="view" ref={viewRef}><p>Drag the board to rotate it</p></div>
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="ctl">{axes.map((axis) => <React.Fragment key={axis}><label htmlFor={`axis-${axis}`}>Rotate about {axis.toUpperCase()}</label><input id={`axis-${axis}`} type="range" min="-180" max="180" value={Math.round(pose[axis])} onChange={(event) => setAxis(axis, event.target.value)} /><output>{Math.round(pose[axis])}°</output></React.Fragment>)}</div>
        <div className="btns">{[["flat", "Lay flat"], ["tilt", "Tilt 45° on X"], ["edge", "Stand on edge"], ["spin", "Spin on Z"], ["shake", "Shake"]].map(([key, title]) => <button key={key} className={mode === key ? "on" : ""} onClick={() => choosePreset(key)}>{title}</button>)}</div>
      </div>
    </div>
    <div className="panel"><div className="read" aria-live="off"><b /><i className="dx">X</i><i className="dy">Y</i><i className="dz">Z</i>
      <b>Accel</b>{readings.accel.map((value, index) => <span className={["dx", "dy", "dz"][index]} key={index}>{value.toFixed(2)}</span>)}<div className="unit">m/s². Resting flat, gravity reads about 9.81 on Z.</div>
      <b>Gyro</b>{readings.gyro.map((value, index) => <span className={["dx", "dy", "dz"][index]} key={index}>{value.toFixed(2)}</span>)}<div className="unit">°/s. This is rotation speed, not angle.</div>
      <b>Temp</b><span style={{ gridColumn: "2/4", textAlign: "left" }}>{readings.temp.toFixed(1)}</span><i style={{ gridColumn: 4 }}>°C</i></div>
      <p id="conv">Gravity is resolved into the sensor axes from the current board orientation. Readings are simulated.</p>
      <pre id="term" aria-label="Simulated Serial Monitor">{serial.slice(-8).join("\n")}</pre>
    </div></div>
    <div className="charts"><div className="panel"><p>Acceleration over the last 10 seconds (±20 m/s²)</p><MotionChart series={series.accel} range={20} label="Acceleration history" /></div>
      <div className="panel"><p>Rotation speed over the last 10 seconds (±500 °/s, the range set in the sketch)</p><MotionChart series={series.gyro} range={500} label="Gyroscope history" /></div></div>
    <section><h2>What the sensor reports</h2><div className="cols">
      <div><h3>Accelerometer</h3><p>Three axes in m/s². Gravity is always part of the reading, so a sensor lying still reports about 9.81 split across the axes by its tilt. Range set to ±2 g.</p></div>
      <div><h3>Gyroscope</h3><p>Three axes of rotation speed. The Adafruit library returns rad/s, and the sketch multiplies by 180/π to print °/s. Range set to ±500 °/s. Adding the speeds up over time gives an angle that slowly drifts.</p></div>
      <div><h3>Temperature</h3><p>The chip’s own temperature in °C. Useful for spotting change, but it is not a calibrated room thermometer.</p></div>
    </div></section>
    <section><h2>Wiring for one sensor</h2><div className="tw"><table><thead><tr><th>ESP32</th><th>MPU-6050 breakout</th><th>Job</th></tr></thead><tbody>
      <tr><td>3V3</td><td>VCC</td><td>Power. Check your breakout’s label before using anything higher.</td></tr><tr><td>GND</td><td>GND</td><td>Shared ground</td></tr><tr><td>GPIO21</td><td>SDA</td><td>I²C data</td></tr><tr><td>GPIO22</td><td>SCL</td><td>I²C clock</td></tr>
    </tbody></table></div></section>
    <section><h2>The sketch, in short</h2><p>Written for the Arduino IDE with the Adafruit MPU6050 library. Setup picks the ranges and filter once. The loop reads, prints, and waits.</p>
      <pre>{`Wire.begin(21, 22);                           // SDA = GPIO21, SCL = GPIO22
mpu.begin();                                  // default I²C address, usually 0x68
mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
mpu.setGyroRange(MPU6050_RANGE_500_DEG);
mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

// in loop()
mpu.getEvent(&a, &g, &temp);
Serial.print(g.gyro.x * 180.0 / PI, 2);       // rad/s to °/s
delay(100);                                   // about 10 readings per second`}</pre>
      <p>The 100 ms delay gives a little under 10 readings a second, since reading and printing take time too. The 21 Hz filter bandwidth is a separate setting and is not the sampling rate.</p>
    </section>
    <section id="control-center" className="cc-section"><div className="cc-kicker">Project 02 · Embedded web dashboard</div><h2>ESP32 Control Center</h2>
      <p className="cc-intro">A separate ESP32 firmware project that creates its own Wi-Fi access point and serves a lightweight browser dashboard. Instead of reading the MPU-6050, this program focuses on device health, basic GPIO control, and a small HTTP request history. This panel is an interactive local mock-up only.</p>
      <div className="cc-overview"><article className="panel cc-project-copy"><h3>What the project is for</h3><p>One local page for checking the board’s current status and trying a simple output control. The firmware serves a compact dashboard rather than requiring a desktop serial monitor.</p>
        <ul className="cc-points"><li><strong>Device health:</strong> uptime, free heap memory, CPU frequency, device IP, connected stations, and reset reason.</li><li><strong>GPIO output:</strong> a dashboard control for the LED connected to GPIO2.</li><li><strong>Request history:</strong> a rolling log of the most recent 40 HTTP requests.</li><li><strong>JSON responses:</strong> small data responses update specific values without rebuilding the whole interface.</li></ul><div className="cc-tags"><span>ESP32</span><span>Wi-Fi SoftAP</span><span>HTTP</span><span>JSON</span><span>GPIO</span><span>Embedded UI</span></div><div className="cc-note-box"><strong>Separate firmware:</strong> the Control Center does not use the MPU-6050 sensor code above. These are two distinct programs demonstrating different ESP32 use cases.</div></article>
        <article className="panel cc-demo-panel"><div className="cc-demo-head"><h3>Dashboard preview</h3><span className="cc-pill">LOCAL MOCK</span></div><p className="cc-demo-note">No device connection is made. Interactions affect this page only.</p>
          <div className="cc-metrics"><div className="cc-metric"><small>Uptime</small><strong>00:18:42</strong></div><div className="cc-metric"><small>Free heap</small><strong>182 KB</strong></div><div className="cc-metric"><small>CPU frequency</small><strong>240 MHz</strong></div><div className="cc-metric"><small>Access point IP</small><strong>192.168.4.1</strong></div><div className="cc-metric"><small>Connected devices</small><strong>2</strong></div><div className="cc-metric"><small>Last reset reason</small><strong style={{ fontSize: "1rem" }}>Power-on</strong></div></div>
          <div className="cc-divider" /><div className="cc-control-row"><div className="cc-control-copy"><strong>LED · GPIO2</strong><small>Browser-only interaction preview</small><span className={`cc-led-state ${ledOn ? "" : "is-off"}`}>{ledOn ? "ON · demo state" : "OFF · demo state"}</span></div><button className="cc-demo-button" aria-pressed={ledOn} onClick={() => { const next = !ledOn; setLedOn(next); addLog(`POST /api/led  200 OK  state=${next ? "on" : "off"}`); }}>{ledOn ? "Turn demo LED off" : "Turn demo LED on"}</button></div>
          <div className="cc-divider" /><div className="cc-log-title"><strong>Recent HTTP activity</strong><span>{logs.length} preview entries</span></div><div className="cc-log" aria-live="polite">{logs.map((line, index) => <span className="cc-log-entry" key={`${line}-${index}`}>{line}</span>)}</div><button className="cc-small-button" onClick={() => setLogs([])}>Clear preview log</button>
        </article></div>
      <div className="cc-subsection"><h3>How the system fits together</h3><p>Conceptual request path for the Control Center, not verified endpoint names.</p><div className="cc-flow">{[["Browser", "Opens the dashboard from a device connected to the ESP32 local network."], ["ESP32 access point", "Provides the local network and serves the dashboard page."], ["HTTP + JSON handlers", "Handles status requests and control actions."], ["Hardware + log", "Reads device information and records recent HTTP activity."]].map(([title, detail]) => <div className="cc-flow-step" key={title}><strong>{title}</strong><span>{detail}</span></div>)}</div></div>
      <div className="cc-subsection"><h3>Core features</h3><div className="cc-feature-grid">
        {[["01 / MONITOR", "System health", "Surface uptime, available heap, CPU clock, IP address, connected Wi-Fi stations, and reset reason for basic diagnostics."], ["02 / CONTROL", "GPIO2 LED", "A dashboard action requests an LED state change. Real hardware should report the outcome returned by the ESP32."], ["03 / OBSERVE", "HTTP request log", "Keep a bounded history of the latest 40 HTTP requests so recent activity is visible without unbounded growth."], ["04 / CONNECT", "Local Wi-Fi access point", "Host a local network for nearby clients. The exact access-point name and security settings depend on the firmware."], ["05 / EXCHANGE", "Small JSON endpoints", "Keep status reads, LED commands, and request history logically distinct with structured responses."], ["06 / SEPARATE", "Focused firmware", "The dashboard project is independent of the motion-sensor sketch, keeping their responsibilities and debugging paths clear."]].map(([number, title, copy]) => <article className="cc-feature" key={title}><span className="cc-feature-num">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}
      </div></div>
      <div className="cc-subsection"><h3>Example API contract</h3><p>Illustrative examples only; confirm actual routes and schemas against the firmware.</p><div className="tw"><table className="cc-api-table"><thead><tr><th>Method</th><th>Example route</th><th>Purpose</th><th>Example response or body</th></tr></thead><tbody><tr><td>GET</td><td><code>/api/status</code></td><td>Read uptime, heap, CPU frequency, IP, and reset reason.</td><td><code>{"{uptimeSeconds:1122,freeHeapBytes:186368}"}</code></td></tr><tr><td>GET</td><td><code>/api/clients</code></td><td>Read connected stations.</td><td><code>{"{connectedDevices:2}"}</code></td></tr><tr><td>POST</td><td><code>/api/led</code></td><td>Request GPIO2 LED state.</td><td><code>{"{state:on}"}</code></td></tr><tr><td>GET</td><td><code>/api/requests</code></td><td>Retrieve recent request history.</td><td><code>{"{items:[...]}"}</code></td></tr></tbody></table></div><div className="cc-note-box"><strong>Implementation note:</strong> route names and response schemas above are illustrative, not verified endpoints.</div></div>
      <div className="cc-subsection cc-split"><div><h3>Typical interaction sequence</h3><ol className="cc-list"><li><strong>Connect:</strong> join the Wi-Fi network broadcast by the ESP32 using its configured credentials.</li><li><strong>Open:</strong> visit the device’s local dashboard address in a browser.</li><li><strong>Inspect:</strong> request current system information and render fields returned in JSON.</li><li><strong>Control:</strong> send a GPIO2 command and check whether firmware reports success.</li><li><strong>Debug:</strong> review recent HTTP request history when an action does not behave as expected.</li></ol></div><div><h3>What would make the project stronger</h3><ul className="cc-list"><li><strong>Clear connection state:</strong> show loading, success, timeout, and error states.</li><li><strong>Refresh strategy:</strong> update telemetry reasonably and stop polling when the page is hidden.</li><li><strong>Typed responses:</strong> keep a consistent schema and handle missing or malformed fields.</li><li><strong>Hardware feedback:</strong> use the device response rather than only the local button state.</li><li><strong>Test checklist:</strong> cover reconnects, repeated commands, unavailable endpoints, and a full request log.</li></ul></div></div>
      <div className="cc-subsection"><h3>Scope and safety notes</h3><div className="cc-separation"><article><h4>What this page demonstrates</h4><p>The preview is a front-end mock-up: toggling the button changes only local state and appends a local demo-log entry. It does not connect to an ESP32, call a real API, or switch physical GPIO2.</p></article><article><h4>Before controlling real hardware</h4><p>Configure the access point deliberately, use a strong network password, protect state-changing endpoints, validate input, and avoid exposing credentials in request logs.</p></article></div></div>
    </section>
    <section id="tech-stack"><div className="cc-kicker">Build notes · Front-end implementation</div><h2>Technology stack &amp; UI design system</h2><p className="cc-intro">A responsive sensor lab with a Three.js scene, controlled React inputs, simulated measurements, and rolling Canvas 2D charts.</p>
      <div className="cc-feature-grid">{[["01 / RENDER", "Three.js", "WebGL circuit-board visualization with a gravity reference and coordinate axes."], ["02 / CONTROLS", "React state", "Sliders and presets change the board pose; dragging directly rotates it."], ["03 / SIMULATION", "Sensor model", "Orientation resolves gravity into the accelerometer axes; readings include small noise."], ["04 / HISTORY", "Canvas 2D", "Two rolling charts show the previous ten seconds of acceleration and gyro values."], ["05 / DASHBOARD", "Local mock", "The LED toggle and request history demonstrate the dashboard interaction without contacting hardware."], ["06 / FIRMWARE", "ESP32", "I²C reads the sensor and serves a separate Wi-Fi dashboard project."]].map(([number, title, copy]) => <article className="cc-feature" key={title}><span className="cc-feature-num">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      <div className="cc-subsection"><h3>UI design style: “Blueprint Grid / Dark Instrumentation”</h3><p>A descriptive name for the visual direction, not an imported design framework. The page combines a deep navy blueprint-like grid, technical telemetry panels, high-contrast numeric readings, amber highlights, and axis colors inspired by lab instrumentation.</p>
        <div className="ts-swatch-grid" aria-label="UI color palette">{[["Deep navy canvas", "--bg · #0e2a5a", "#0e2a5a"], ["Primary text", "--ink · #e9f0ff", "#e9f0ff"], ["Muted text", "--mute · #a4b8dc", "#a4b8dc"], ["Amber accent", "--amber · #ffc857", "#ffc857"], ["X axis / coral", "--x · #ff7a7a", "#ff7a7a"], ["Y axis / mint", "--y · #6ee7a0", "#6ee7a0"], ["Z axis / blue", "--z · #74b9ff", "#74b9ff"], ["Terminal surface", "#04101f", "#04101f"]].map(([name, token, color]) => <div className="ts-swatch" key={name}><div className="ts-swatch-color" style={{ background: color }} /><div className="ts-swatch-copy"><strong>{name}</strong><code>{token}</code></div></div>)}</div>
        <div className="tw"><table className="ts-token-table"><thead><tr><th>Token / rule</th><th>Current value</th><th>Purpose</th></tr></thead><tbody><tr><td><code>--panel</code></td><td><code>rgba(5, 16, 40, 0.6)</code></td><td>Translucent dark surface for main panels.</td></tr><tr><td><code>--line</code></td><td><code>rgba(255, 255, 255, 0.14)</code></td><td>Subtle borders and blueprint grid lines.</td></tr><tr><td>Grid background</td><td><code>36px × 36px</code></td><td>Crossing linear gradients form a fixed engineering-paper grid.</td></tr><tr><td>Page container</td><td><code>max-width: 1120px</code></td><td>Readable width centered on wide screens.</td></tr><tr><td>Panel corners</td><td><code>7–10px</code> typical</td><td>Soft card geometry; the 3D viewport uses a sharper edge.</td></tr><tr><td>Focus state</td><td><code>3px solid --amber</code></td><td>Visible keyboard focus outline for links, buttons, and inputs.</td></tr></tbody></table></div>
      </div>
      <div className="cc-subsection"><h3>Font pairing and type roles</h3><div className="ts-font-card"><div className="ts-font-sample"><div className="ts-label">Display / metrics</div><div className="ts-sample-heading">Bricolage Grotesque</div><div className="ts-sample-body">Weights 600 and 800 are used for page and section headings and prominent numeric telemetry.</div></div><div className="ts-font-sample"><div className="ts-label">Body / controls</div><div style={{ fontFamily: '"IBM Plex Sans", system-ui, sans-serif', fontSize: "1.2rem" }}>IBM Plex Sans</div><div className="ts-sample-body">Weights 400 and 600 are used for body text, labels, buttons, and explanatory copy.</div></div></div><p className="ts-small-note">Code and telemetry use <code className="ts-inline-code">ui-monospace, Menlo, Consolas, monospace</code>. Google Fonts load externally; local system fallbacks remain in CSS.</p></div>
      <div className="cc-subsection"><h3>Layout, animation, and responsive behavior</h3><div className="cc-feature-grid">{[["Two-column lab", "The simulator uses CSS Grid: the 3D viewport gets more width than the live readings panel. Charts use two equal columns on large screens."], ["Responsive breakpoints", "At 860px the simulator, charts, and content columns stack. At 560px dashboard cards, flow steps, color swatches, and font samples become single-column."], ["Motion loop", "requestAnimationFrame renders the 3D scene. A 100 ms interval updates simulated readings and rolling plots, targeting about 10 samples per second."]].map(([title, copy]) => <article className="ts-card" key={title}><h3>{title}</h3><p>{copy}</p></article>)}</div></div>
    </section>
    <footer>Zaky Azhari. Project report: MPU-6050 + ESP32, BBPVP Bandung.</footer>
  </div>;
}
