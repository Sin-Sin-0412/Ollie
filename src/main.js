import * as THREE from "three";
import { initWorld } from "./world.js";
import { initAnimations, updateAnimations } from "./animation.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import gsap from "gsap";

const canvas = document.querySelector("canvas.webgl");

const scene = new THREE.Scene();

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

//! カメラ
const camera = new THREE.PerspectiveCamera(
  40,
  sizes.width / sizes.height,
  0.1,
  100,
);

scene.add(camera);

//! レンダー
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});

renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.22;

//! カメラ調整
function adjustCamera(width, height) {
  const aspect = width / height;
  camera.aspect = aspect;

  const config = {
    mobile: {
      fov: 55,
      x: -5,
      y: 3.4,
      z: 5,
    },

    desktop: {
      fov: 35,
      x: -5.5,
      y: 3.4,
      z: 9,
    },

    ultrawide: {
      fov: 30,
      x: -5.5,
      y: 3.4,
      z: 9,
    },
  };

  const minAspect = 1.77;
  const maxAspect = 2.5;

  let targetFov, targetX, targetY, targetZ;

  if (aspect < 1) {
    // 1. スマホ・縦長画面
    targetFov = config.mobile.fov;
    targetX = config.mobile.x;
    targetY = config.mobile.y;
    targetZ = config.mobile.z;
  } else if (aspect <= minAspect) {
    // 2. 標準的なPC画面（16:9以下）
    targetFov = config.desktop.fov;
    targetX = config.desktop.x;
    targetY = config.desktop.y;
    targetZ = config.desktop.z;
  } else if (aspect >= maxAspect) {
    // 3. ウルトラワイド（21:9以上）
    targetFov = config.ultrawide.fov;
    targetX = config.ultrawide.x;
    targetY = config.ultrawide.y;
    targetZ = config.ultrawide.z;
  } else {
    // 4. 標準〜ワイドの間（滑らかに補間）
    //* t = 0はデスクトップ、 t = 1はウルトラワイド、 t = 0.5はちょうど中間
    //* tとは標準とワイドの間のどのへんにいるかを報告する係（ 0〜1 ）。
    //* lerp関数：報告を受けて、その場所にぴったりの「中間の数字」を算出する計算機。
    const t = (aspect - minAspect) / (maxAspect - minAspect);

    // 線形補間の計算関数
    const lerp = (start, end, t) => start + (end - start) * t;

    targetFov = lerp(config.desktop.fov, config.ultrawide.fov, t);
    targetX = lerp(config.desktop.x, config.ultrawide.x, t);
    targetY = lerp(config.desktop.y, config.ultrawide.y, t);
    targetZ = lerp(config.desktop.z, config.ultrawide.z, t);
  }

  // もし、アスペクト比が 2.5 を超えたら...
  if (aspect > 2.5) {
    const vFovRad = (config.ultrawide.fov * Math.PI) / 180;
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * maxAspect);

    // 固定した横幅を維持するために、現在のアスペクト比に合わせて縦のFOVを逆算する
    targetFov = (2 * Math.atan(Math.tan(hFovRad / 2) / aspect) * 180) / Math.PI;

    // 位置はウルトラワイドの設定をそのまま使用
    targetX = config.ultrawide.x;
    targetY = config.ultrawide.y;
    targetZ = config.ultrawide.z;
  }

  // カメラに値を適用
  camera.fov = targetFov;
  camera.position.set(targetX, targetY, targetZ);

  // ルックアット
  camera.lookAt(0.5, 2, 0);

  // 行列を更新（これを忘れると反映されない）
  camera.updateProjectionMatrix();
}

//! 初回カメラ設定
adjustCamera(sizes.width, sizes.height);

//! ローディングアニメーション
const MIN_LOADING_TIME = 3000; 

const Manager = new THREE.LoadingManager();

//* ① 最低3秒待機するPromise
const timerPromise = new Promise((resolve) =>
  setTimeout(resolve, MIN_LOADING_TIME),
);

//* ② ロード完了を待つPromise
const loadPromise = new Promise((resolve) => {
  Manager.onLoad = () => resolve();
  // 既存のinitWorldにmanagerを渡す
  initWorld(scene,renderer, Manager);
});

// 1. 要素の取得
const textElements = document.querySelectorAll(".loading-text, .loading-subtext");

// 2. 文字の分解処理
textElements.forEach(el => {
  el.innerHTML = el.textContent.replace(/\S/g, "<span class='char'>$&</span>");
});

const chars = document.querySelectorAll(".char");

// 3. アニメーションの開始（1つのsetTimeoutにまとめると確実です）
setTimeout(() => {
  // 親要素を見える状態にする
  gsap.set(textElements, { autoAlpha: 1 });

  // じわっと現れる（登場）
  gsap.fromTo(chars, 
    { 
      opacity: 0, 
      filter: "hue-rotate(360deg)" 
    },
    { 
      opacity: 1, 
      filter: "hue-rotate(0deg)", 
      duration: 2, 
      stagger: 0.15, // サブタイトルまで流れるように少し速めに設定
      ease: "power2.out",
    }
  );

  // 各文字をバラバラに浮かせる（構文エラーを修正）
  chars.forEach((char) => {
    gsap.to(char, {
      x: "random(-3, 3)",
      y: "random(-3, 3)",
      rotation: "random(-5, 5)",
      duration: "random(1.5, 3)",
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
  });
}, 100);


//* 両方の準備が整ったら（最短でも3秒後）
Promise.all([timerPromise, loadPromise]).then(() => {
  const screen = document.getElementById("loading-screen");
  const video = document.getElementById("loading-video");

  gsap.to(chars, {
    opacity: 0,
    duration: 1.5,
    stagger: 0.05,
  });

  //* フェードアウト開始（CSSのtransitionが発動）
  screen.classList.add("fade-out");
  video.classList.add("fade-out");
  canvas.classList.add("focused");

  //* 1.5秒のフェードが終わったら要素を完全に消去（メモリ節約）
  setTimeout(() => {
    screen.remove();
  }, 1500);
});

//! ポストプロセス各数値
const params = {
  warmEnabled: true,
  warmIntensity: 3,

  noiseAmount: 0.07,

  bloomEnabled: true,
  bloomStrength: 0.29,
  bloomRadius: 0.1,
  bloomThreshold: 0.01,

  dofEnabled: true,
  dofFocus: 11.39,
  dofAperture: 0.00047,
  dofMaxblur: 0.0048,

  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 0.22,
};

// ウォームトーン
const WarmToneShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 3 },
    uNoiseAmount: { value: 0.05 },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(sizes.width, sizes.height) },
  },

  vertexShader: `
  varying vec2 vUv;

  void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `,

  fragmentShader: `
  uniform sampler2D tDiffuse;
  uniform float intensity;
  uniform float uNoiseAmount;
  uniform float uTime;

  varying vec2 vUv;

  //* 高精度な乱数を作るための関数（グレイン)
  float random(vec2 uv, float time){
  return fract(sin(dot(uv, vec2(12.9898, 78.233)) + time) * 43758.5453);
  }
  uniform vec2 uResolution;

  void main(){
  vec4 tex = texture2D(tDiffuse, vUv);
  vec3 color = tex.rgb;
  color.r *= mix(1.0, 1.08, intensity);
  color.g *= mix(1.0, 1.01, intensity);
  color.b *= mix(1.0, 0.92, intensity);

  //* 伸びないノイズ処理
  //* vUv（0〜1）ではなく、大きな数（uTimeなど）を混ぜることで
  //* 画面の比率に依存しない細かい砂嵐を作る
  vec2 pixelCoord = vUv * uResolution;
  float noise = random(pixelCoord, fract(uTime));

  //* ノイズを色に加算（少しだけ明るく/暗くする）
  float luminance = dot(color, vec3(0.299, 0.587, 0.144));
  float shadowGrain = mix(1.4, 0.1, luminance);
  color += (noise - 0.5) * uNoiseAmount * shadowGrain;


  gl_FragColor = vec4(color, tex.a);
  }
  `,
};

//! コンポーザー
// 1. 深度バッファの精度を担保したターゲットを作成
const target = new THREE.WebGLRenderTarget(sizes.width, sizes.height, {
  type: THREE.HalfFloatType, // 色の精度を上げる
  format: THREE.RGBAFormat,
  stencilBuffer: false,
  depthBuffer: true,
  samples: 2.7,
});

// 2. そのターゲットを使ってコンポーザーを初期化
const composer = new EffectComposer(renderer, target);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

//! ボケ
const bokehPass = new BokehPass(scene, camera, {
  focus: params.dofFocus,
  aperture: params.dofAperture,
  maxblur: params.dofMaxblur,
});

bokehPass.enabled = window.innerWidth > 768 ? true : false;
composer.addPass(bokehPass);

//! ブルーム
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(sizes.width / 2, sizes.height / 2),
  params.bloomStrength,
  params.bloomRadius,
  params.bloomThreshold,
);

composer.addPass(bloomPass);

//! ここでウォームトーン追加
const warmPass = new ShaderPass(WarmToneShader);
composer.addPass(warmPass);

//! トーンマッピングと色変換を適用するパスを追加
const outputPass = new OutputPass();
composer.addPass(outputPass);

//! リサイズ関数
window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  adjustCamera(sizes.width, sizes.height);

  renderer.setSize(sizes.width, sizes.height);

  target.setSize(sizes.width, sizes.height);

  composer.setSize(sizes.width * 0.7, sizes.height * 0.7);

  bloomPass.setSize(sizes.width, sizes.height);
  warmPass.uniforms.uResolution.value.set(sizes.width, sizes.height);
});

//! アニメーション
const clock = new THREE.Clock();

const tick = () => {

  const delta = clock.getDelta();

  //* ノイズを動かす
  const elapsedTime = clock.elapsedTime;

  warmPass.uniforms.uTime.value = elapsedTime;

  //* 追加：毎フレーム羽根を回す
  updateAnimations(delta);

  composer.render();
};

renderer.setAnimationLoop(tick);
