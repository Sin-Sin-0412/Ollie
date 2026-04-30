import * as THREE from 'three';
import gsap from "gsap";
import { model } from "./world.js";
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const textureLoader = new THREE.TextureLoader()
const _lookAtTarget = new THREE.Vector3();

let mixer;
let actions = {};
let activeAction;
let faceMaterial;
let defaultFaceTexture;
let fishGroups = [];
let waterMaterial;
let waterMaterial2;
let waterFallMaterial;
let rippleMaterial;
let isAkubi = false;
let rainMaterial1;
let rainMaterial2;
let lightTime = 0;
let _pointLight1;
let _pointLight2;
let _sunLight;

//* ★【最適化1】 毎フレームの new を防ぐため、計算用の変数を外に出しておく
const _targetQuaternion = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _depthColor = new THREE.Color("#062d35");
const _surfaceColor = new THREE.Color("ffffff");

//* ★【最適化2】 毎フレーム探しに行かないようにメッシュをキャッシュする変数
let waterFallMesh;
let fanBodyMesh;
let fanBladesMesh;
let fanTime = 0;

//* 雨のテクスチャ
const rainTexture = textureLoader.load("/image/rain.png", (t) =>{
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.rotation = -Math.PI / 2;
  t.repeat.set(8, 1);
});

//* しぶき用
const rippleTexture = textureLoader.load("/image/ripple.png", (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
});

//* 水面用テクスチャローダー
const waterNormal = textureLoader.load("/image/water.png", (texture)=>{
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.5, 0.5);
});

//* あくび用テクスチャローダー

const akubiFaceTexture = textureLoader.load("/image/akubi.png", (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; 
});

//* 瞬き用テクスチャ読み込み
const closedEyeTexture = textureLoader.load("/image/closed_eye.png", (texture)=>{
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
});


//! モデル読み込みなど
export const initAnimations = (model, animations, pointLight1, pointLight2, sunLight) => {
  _pointLight1 = pointLight1;
  _pointLight2 = pointLight2;
  _sunLight = sunLight;

  if (!model || !animations) return;

  //* 顔のマテリアルを取得
  const faceMesh = model.getObjectByName("mesh_71_1");
  if(faceMesh){
    faceMaterial = faceMesh.material;
    defaultFaceTexture = faceMaterial.map;
  }

  //* ミキサー
  mixer = new THREE.AnimationMixer(model);

  //* 全てのアニメーションを actions オブジェクトに登録
  animations.forEach((clip)=>{
    const action = mixer.clipAction(clip);
    actions[clip.name] = action;

    //* 割り込みアクション（scratch, akubi, fake）は1回だけで止まるように設定
    if(clip.name !== "breath" && clip.name !== "fish" && clip.name !== "fish2"){
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
  });

  //* --- 呼吸（breath）を基本として再生 ---
  if(actions["breath"]){
    activeAction = actions["breath"];
    activeAction.play();
  }

  //* --- 割り込みアニメーション終了時の処理 ---
  mixer.addEventListener("finished", (e)=>{
    const finishedAction = e.action;
    const clipName = finishedAction.getClip().name;

    if(clipName === "akubi" && faceMaterial && !isAkubi){
      faceMaterial.map = defaultFaceTexture;
    }

    //* 0.5秒かけて breath に戻す
    actions["breath"].reset().play();
    actions["breath"].crossFadeFrom(finishedAction, 0.5, false);
    activeAction = actions["breath"];
  });

  //* --- ランダムイベントのタイマー開始 ---
  scheduleRandomAction("scratch", 15, 120);
  scheduleRandomAction("akubi", 60, 180);
  scheduleRandomAction("fake", 30, 90);

  //* ★【最適化2】 よく動かすメッシュをここで一回だけ探して保存しておく
  waterFallMesh = model.getObjectByName("water_fall");
  fanBodyMesh = model.getObjectByName("fan_body");
  fanBladesMesh = model.getObjectByName("fan");

  //* 瞬きの無限ループ開始
  scheduleBlink();

  //*蛇口の水
  if(waterFallMesh){
    waterFallMaterial = new THREE.MeshStandardMaterial({
      color: "#bae1ec",
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      metalness: 0.4,
    });
    waterFallMesh.material = waterFallMaterial;
  }

  //* しぶき
  [1, 2, 3, 4].forEach(i =>{
    const splash = model.getObjectByName(`water_splash_${i}`);
    if(splash){
      splash.material = new THREE.MeshStandardMaterial({
        map: rippleTexture, // 波紋画像を流用
        transparent: true,
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 0.8, // 遠くからでも見えるように強く発光
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      //* パチパチさせる（ランダムな点滅とスケール）
      gsap.to(splash.material, {
        opacity: "random(0, 0.9)",
        duration: 0.05,
        repeat: -1,
        repeatRefresh: true,
        ease: "none"
      });

      gsap.to(splash.scale, {
        x: "random(0.8, 1.5)",
        y: "random(1.2, 2.5)", // 縦に伸ばしてしぶき感を強調
        z: "random(0.8, 1.5)",
        duration: 0.07,
        repeat: -1,
        repeatRefresh: true,
        ease: "none"
      });
    }
  })

  //* 1枚目の雨のプレーン
  const rain1 = model.getObjectByName("rain_plane_1");
  if (rain1) {
    rainMaterial1 = new THREE.MeshStandardMaterial({
      map: rainTexture,
      transparent: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
    rain1.material = rainMaterial1;
  }

  //* 2枚目の雨プレーン
  const rain2 = model.getObjectByName("rain_plane_2");
  if (rain2) {
    // 2つの動きに差をつけるため、テクスチャをクローンしてマテリアルを分けます
    rainMaterial2 = new THREE.MeshStandardMaterial({
      map: rainTexture.clone(),
      transparent: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.4, // 2枚目は少し薄くして奥行きを出す
      side: THREE.DoubleSide
    });
    rain2.material = rainMaterial2;
  }
  

  //* 水面
  const waterSurface = model.getObjectByName("water_surface");
  if(waterSurface){
    waterMaterial = new THREE.MeshStandardMaterial({
      color: "#243d2c",
      transparent: true,
      opacity: 0.1,
      normalMap: waterNormal,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    waterSurface.material = waterMaterial;

    //* 二枚目の作成
    const waterSurface2 = waterSurface.clone();
    waterSurface2.position.y += 0.0005;

    //* 二枚目専用マテリアル
    const waterNormal2 = waterNormal.clone();
    waterNormal2.rotation = Math.PI * 0.25; // 45度傾ける
    waterNormal2.center.set(0.5, 0.5);
    waterNormal2.wrapS = THREE.RepeatWrapping;
    waterNormal2.wrapT = THREE.RepeatWrapping;

    waterMaterial2 = new THREE.MeshStandardMaterial({
      color: "#4e845f",
      transparent: true,
      opacity: 0.2,
      normalMap: waterNormal2,
      roughness: 0.15,
      metalness: 0.1,
    //* 2枚重なることで深みが出るように「加算」に近い見た目を目指します
  });
  waterSurface2.material = waterMaterial2;
  model.add(waterSurface2);
  }

  //* 水の中身
  const waterSide = model.getObjectByName("water_side");
  if(waterSide){
    waterSide.material = new THREE.MeshStandardMaterial({
      color: "#1d111a",
      transparent: true,
      opacity: 1,
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide
    });
  }


  //! 金魚のクローン
  const fishArea = model.getObjectByName("fish_area");
  if(fishArea){
    fishArea.visible = false;

    //* 水槽の範囲（サイズと位置）を取得
    const box = new THREE.Box3().setFromObject(fishArea);
    const min = box.min;
    const max = box.max;

    //* クローンしたい金魚
    const originalFish = [
      model.getObjectByName("fish"),
      model.getObjectByName("fish2")
    ];

    //* 元の金魚を消す
    originalFish.forEach(f => {if(f) f.visible = false;});

    //* 20匹増やす
    for(let i = 0; i < 40; i++){
      const source = originalFish[i  % 2];
      if(!source) continue;

      //* 骨ごとコピー
      const clonedFish = SkeletonUtils.clone(source);

      //* 金魚のマテリアルを独自のものにする
      const meshChildren = [];
      clonedFish.traverse((child) =>{
        if(child.isMesh){
          child.material = child.material.clone();
          child.material.metalness = 0.9;
          child.material.roughness = 0.4;
          meshChildren.push(child);
        }
      });


      const s = THREE.MathUtils.randFloat(0.6, 1);
      clonedFish.scale.set(s, s, s);
      clonedFish.visible = true;
      model.add(clonedFish);

      //* 個別のミキサー作成
      const fishMixer = new THREE.AnimationMixer(clonedFish);
      const clip = animations.find(anim => anim.name === (i % 2 === 0 ? 'fish' : 'fish2'));

      if(clip){
        const action = fishMixer.clipAction(clip);
        action.play();
        //* 再生位置をランダムにずらす
        action.time = Math.random() * clip.duration;
      }

      //* 初期位置をfish_areaの範囲内にランダム配置
      clonedFish.position.set(
        THREE.MathUtils.randFloat(min.x, max.x),
        THREE.MathUtils.randFloat(min.y, max.y),
        THREE.MathUtils.randFloat(min.z, max.z),
      );

      //* 向いてる方もランダムに
      clonedFish.rotation.y = Math.random() * Math.PI * 2;

      //* 泳ぐ情報を保存
      fishGroups.push({
        mesh: clonedFish,
        meshChildren: meshChildren,
        mixer: fishMixer,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.01,
        ),
        area: {min, max}
      });
    }
  }
};


//! ランダムアニメーション関数
const scheduleRandomAction = (actionName, minSec, maxSec) =>{
  const randomDelay = (Math.random() * (maxSec - minSec) + minSec) * 1000;

  setTimeout(()=>{
    const nextAction = actions[actionName];
    if(nextAction && activeAction === actions["breath"]){

      //* 0.5秒かけて breath から割り込みアクションへなめらかに移行
      nextAction.reset().play();
      nextAction.crossFadeFrom(actions["breath"], 0.5, false);
      activeAction = nextAction;

      //* あくびの時の顔切り替え
      if(actionName === "akubi" && faceMaterial){
        isAkubi = true;

        setTimeout(()=>{
          faceMaterial.map = akubiFaceTexture;
        }, 1000);

        setTimeout(()=>{
          faceMaterial.map = defaultFaceTexture;
          isAkubi = false; //* あくび終了フラグOFF(瞬き再開)
        }, 2900);
      }
    }

    //* 終わったら次のタイマーをセット（無限ループ）
    scheduleRandomAction(actionName, minSec, maxSec);
  }, randomDelay);
};


//! 瞬き専用ループ関数
const scheduleBlink = ()=>{
  const randomDelay = (Math.random() * ( 10 - 4) + 4) * 1000;

  setTimeout(()=>{
    if(!isAkubi && faceMaterial){
      faceMaterial.map = closedEyeTexture;

      setTimeout(()=>{
        if(!isAkubi){
          faceMaterial.map = defaultFaceTexture;
        }
      }, 100);
    }

    scheduleBlink();
  }, randomDelay);
};


//! --- tick 用の更新関数 ---
export const updateAnimations = (delta) => {
  if (!model) return;

  if(mixer){
    mixer.update(delta);
  }

  //! 金魚を泳がせる
  fishGroups.forEach(fish =>{
    fish.mixer.update(delta);

    //*進路をわずかに変化させる
    fish.velocity.x += (Math.random() - 0.5) * 0.001;
    fish.velocity.y += (Math.random() - 0.5) * 0.001;
    fish.velocity.z += (Math.random() - 0.5) * 0.001;

    //* 一定の速さを保つ
    const speed = 0.005;
    fish.velocity.normalize().multiplyScalar(speed);

    //* 移動と壁の判定
    fish.mesh.position.add(fish.velocity);

    //* 水槽の壁に当たったら跳ね返る
    if (fish.mesh.position.x < fish.area.min.x || fish.mesh.position.x > fish.area.max.x) fish.velocity.x *= -1;
    if (fish.mesh.position.y < fish.area.min.y || fish.mesh.position.y > fish.area.max.y) fish.velocity.y *= -1;
    if (fish.mesh.position.z < fish.area.min.z || fish.mesh.position.z > fish.area.max.z) fish.velocity.z *= -1;

    //* 現在地から進行方向（position + velocity）を向く行列を作成
    _lookAtTarget.copy(fish.mesh.position).add(fish.velocity);
    _matrix.lookAt(fish.mesh.position, _lookAtTarget, fish.mesh.up);
    _targetQuaternion.setFromRotationMatrix(_matrix);

    //* 0.05（5%）ずつ目標の向きに近づける（これで旋回がスムーズになる）
    fish.mesh.quaternion.slerp(_targetQuaternion, 0.02);

    //* 最初に保存したリストだけを回す
    const range = fish.area.max.y - fish.area.min.y;
    const normalizedY = (fish.mesh.position.y - fish.area.min.y) / range;
    const lerpFactor = Math.max(0, Math.min(1, normalizedY)); // 割合を計算

    //* 下に行くほど depthColor に近づき、テクスチャが水の色に沈んでいく
    fish.meshChildren.forEach((child) =>{
      child.material.color.lerpColors(_depthColor, _surfaceColor, lerpFactor);
    });
    
  })

  //* 雨を垂直方向にスクロール
  if(rainMaterial1 && rainMaterial1.map){
    rainMaterial1.map.offset.y -= 4.0 * delta;
  }
  
  if (rainMaterial2 && rainMaterial2.map) {
    // 2枚目は奥として少しゆっくりめに
    rainMaterial2.map.offset.y -= 2.5 * delta;
    // ついでに少しだけX方向にもずらすと、風で流れている感が出ます
    rainMaterial2.map.offset.x += 0.1 * delta;
  }

  //* 水面スクロール
  if(waterMaterial && waterMaterial.normalMap){
    waterMaterial.normalMap.offset.x += 0.010 * delta;
    waterMaterial.normalMap.offset.y += 0.005 * delta;
  }

  //* 二枚目
  if (waterMaterial2 && waterMaterial2.normalMap) {
  // 2枚目：左斜め下へ、1枚目より少しゆっくり
    waterMaterial2.normalMap.offset.x += 0.008 * delta;
    waterMaterial2.normalMap.offset.y += 0.005 * delta;
  }

  //* 落下水
  if (waterFallMesh) {
    // 2. ジグザグメッシュを回転させて形状を変化させる
    waterFallMesh.rotation.z += 0.1; 
  }

  //* 扇風機首振り
  if(fanBodyMesh){
    fanTime += delta;
    fanBodyMesh.rotation.z = Math.sin(fanTime * 0.4) * (Math.PI * 0.2);
  }

  if (fanBladesMesh) {
    // 常に回り続ける
    fanBladesMesh.rotation.y += 0.4 * delta * 60;
  }

  //* 蛍光灯のゆらぎ
  lightTime += delta;
  if (_pointLight1 && _pointLight2){
    const base = 4;
    //* 「* 数値」の部分がゆらぎの幅。「lightTime * 数値」のところが周波数で、大きいほど速くチカチカ・小さいとゆっくり。
    const noise1 = Math.sin(lightTime * 1.3) * 0.95 + Math.sin(lightTime * 0.7) * 0.18;
    const noise2 = Math.sin(lightTime * 0.9) * 0.75 + Math.sin(lightTime * 1.3) * 0.08;

    _pointLight1.intensity = base + noise1;
    _pointLight2.intensity = base + noise2;
  }

  //* 屋外光
  if(_sunLight){
  const base = 0.6;
  const cloudNoise = Math.sin(lightTime * 0.1) * 0.15 + Math.sin(lightTime * 0.4) * 0.05;
  _sunLight.intensity = base + cloudNoise;
}
};
