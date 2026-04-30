import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { initAnimations } from './animation.js';
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

export let model;
let initialized = false;

/**
 * 初期設定値
 * 太陽光（Sun）と室内灯（Room）を明確に分けて管理します
 */
const params = {
  fog: {
    color: '#171c26',
    near: 1,
    far: 25
  },
  fog2: {
    color: '#171c26',
  },
  hemiLight: {
    skyColor: '#ffe7e5',
    groundColor: '#543c21',
    intensity: 1
  },
  // 屋外からの主光源（太陽光）
  sunLight: {
    color: '#679dd0',
    intensity: 0.6,
    x: 8.64,
    y: 5.19,
    z: -7.38,
    helper: false,
    shadow:{
      cast: true,
      mapSize: 1024,
      cameraSize: 10,
      bias: -0.0009,
      normalBias: 0.05,
      helper: false,
      near: 5.38462,
      far: 16.642
    }
  },
  // 室内用の補助光源（窓際や特定の照明）
  roomLight: {
    color: '#c7c49e',
    intensity: 0.4,
    x: 1.02,
    y: 5.76,
    z: 0,
    helper: false,
    shadow:{
      cast: true,
      mapSize: 1024,
      cameraSize: 8.742,
      bias: -0.0001,
      normalBias: 0.05,
      helper: false,
      near: 5.4,
      far: 6.8
    }
  },
  pointLight1: {
    color: '#e1f4dc',
    intensity: 4,
    distance: 9.9,
    decay: 0.2,
    x: 5.46,
    y: 6.21,
    z: -5.22,
    helper: false
  },
  pointLight2: {
    color: '#f4dcf2',
    intensity: 4,
    distance: 8,
    decay: 0.2,
    x: 5.46,
    y: 6.21,
    z: 1.65,
    helper: false
  }
};

export function initWorld(scene, renderer, manager) {
  if (initialized) return;
  initialized = true;

  //! 環境マップ
  const exrLoader = new EXRLoader(manager);
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  exrLoader.load("/image/cloud.exr", (texture)=>{
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.3;
    texture.dispose();
    pmremGenerator.dispose();
  });
  
  const fog = scene.fog = new THREE.FogExp2(params.fog2.color, 0.07);

  //! ヘミスフィア
  const hemiLight = new THREE.HemisphereLight(params.hemiLight.skyColor, params.hemiLight.groundColor, params.hemiLight.intensity);
  scene.add(hemiLight);

  //! 屋内屋外光
  const createDirLight = (config, name) => {
    const light = new THREE.DirectionalLight(config.color, config.intensity);
    light.position.set(config.x, config.y, config.z);

    light.castShadow = config.shadow.cast;
    light.shadow.mapSize.set(config.shadow.mapSize, config.shadow.mapSize);

    const sCam = light.shadow.camera;
    sCam.left = -config.shadow.cameraSize;
    sCam.right = config.shadow.cameraSize;
    sCam.top = config.shadow.cameraSize;
    sCam.bottom = -config.shadow.cameraSize;
    
    sCam.near = config.shadow.near;
    sCam.far = config.shadow.far;

    light.shadow.bias = config.shadow.bias;
    light.shadow.normalBias = config.shadow.normalBias;

    scene.add(light);
  };

  const sunLight = createDirLight(params.sunLight, '屋外ライト');
  createDirLight(params.roomLight, '屋内ライト');


  //! ポイントライト
  const createPointLight = (config, name) => {
    const light = new THREE.PointLight(config.color, config.intensity, config.distance, config.decay);
    light.position.set(config.x, config.y, config.z);
    scene.add(light);
  };

  const pl1 = createPointLight(params.pointLight1, '蛍光灯1');
  const pl2 = createPointLight(params.pointLight2, '蛍光灯2');


  //! 実写背景
  const textureLoader = new THREE.TextureLoader(manager);
  const bgTexture = textureLoader.load("/image/soto.jpg");
  bgTexture.colorSpace = THREE.SRGBColorSpace;

  const bgWidth = 2048 / 1152;
  const bgHeight = 1;
  const bgGeometry = new THREE.PlaneGeometry(bgWidth, bgHeight);

  const bgMaterial = new THREE.MeshBasicMaterial({
    map: bgTexture,
    side: THREE.DoubleSide,
    transparent: false
  });

  const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);

  bgMesh.position.set(10, 5, -4);
  bgMesh.scale.set(10, 10, 10);
  bgMesh.rotation.y = -Math.PI / 2;
  scene.add(bgMesh);


  //! モデル読み込み
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); 
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(dracoLoader);

  loader.load('/model/ollie02.glb', (gltf) => {
    model = gltf.scene;
    model.scale.set(0.5, 0.5, 0.5);
    model.rotation.y = -Math.PI;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // 質感調整

        //* 蛍光灯
        if (child.name === 'light' || child.name === 'light2'){
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color("#e1f4dc");
          child.material.emissiveIntensity = 22.0;
        }

        //*窓枠
        if(child.name.includes("window_frame") || child.name === 'door'){
          child.material = child.material.clone();
          child.material.metalness = 0.9;
          child.material.roughness = 0.1;
        }

        //*窓ガラス
        if(child.name.includes("window_glass")){
          child.material = child.material.clone();
          child.material.metalness = 0.8;
          child.material.roughness = 0.5;
          child.material.transparent = true;
          child.material.needsUpdate = true;
          child.material.opacity = 0.4;
        }

        //*木台
        if(child.name.includes("wood_table")){
          child.material = child.material.clone();
          child.material.metalness = 0.3;
          child.material.roughness = 0.6;
        }

        //*灰皿
        if(child.name === 'ashtray_2'){
          child.material = child.material.clone();
          child.material.metalness = 1;
          child.material.roughness = 0.7;
        }

        //*エアコン
        if(child.name === 'aircon'){
          child.material = child.material.clone();
          child.material.metalness = 0.2;
          child.material.roughness = 0.1;
        }

        //*オリー髪
        if(child.name === 'mesh_71_3'){
          child.material = child.material.clone();
          child.material.metalness = 0.1;
          child.material.roughness = 0.6;
        }

        /*
         // メッシュを特定するコード
        if (child.name === 'mesh_93_1') {
          child.material.color.set('red');
        }

        console.log(child.name, child.type);
        */


      }
    });

    scene.add(model);
    initAnimations(model, gltf.animations, pl1, pl2, sunLight);
    
  });
}