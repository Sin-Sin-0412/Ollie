let audioCtx;
let rainBuffer;
let carBuffer;
let rainSource;
let rainGain; // フェードアウトさせるためにGainをグローバルに保持
let carTimer;
let isPlaying = false;

const iconOn = `<img src="/image/kasa.svg" width="18" height="18" alt="">`;
const iconOff = `<img src="/image/kasa-off.svg" width="18" height="18" alt="">`;

const soundToggleBtn = document.getElementById("sound-toggle");

async function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  rainBuffer = await loadAudio("/audio/rain3.mp3");
  carBuffer = await loadAudio("/audio/car.mp3");
}

async function loadAudio(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

// --- 2. 雨の音（フェードイン付き）---
function playRain() {
  rainSource = audioCtx.createBufferSource();
  rainSource.buffer = rainBuffer;
  rainSource.loop = true;
  
  rainGain = audioCtx.createGain();
  
  // フェードインの処理：音量0からスタート
  rainGain.gain.setValueAtTime(0, audioCtx.currentTime);
  // 2秒かけて音量を0.4まで滑らかに上げる
  rainGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 2);
  
  rainSource.connect(rainGain);
  rainGain.connect(audioCtx.destination);
  rainSource.start(0);
}

// --- 3. 車の音（フィルターなし）---
function playCar() {
  const carSource = audioCtx.createBufferSource();
  carSource.buffer = carBuffer;
  
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.7; 
  
  carSource.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  carSource.start(0);
}

// --- 4. 車の音のランダムタイマー（30秒〜3分）---
function scheduleCarSound() {
  const minTime = 30 * 1000;
  const maxTime = 180 * 1000;
  const randomDelay = Math.random() * (maxTime - minTime) + minTime;
  
  carTimer = setTimeout(() => {
    if (isPlaying) {
      playCar();
      scheduleCarSound(); 
    }
  }, randomDelay);
}

// --- 5. ボタンのオン/オフ制御（フェードアウト対応）---
soundToggleBtn.addEventListener("click", async () => {
  if (!audioCtx) {
    await initAudio();
  }
  
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  
  if (!isPlaying) {
    isPlaying = true;
    soundToggleBtn.innerHTML = iconOff ;
    playRain();
    scheduleCarSound();
  } else {
    isPlaying = false;
    soundToggleBtn.innerHTML = iconOn ;
    
    // 雨音のフェードアウト処理
    if (rainGain && rainSource) {
      // 今の音量を固定
      rainGain.gain.setValueAtTime(rainGain.gain.value, audioCtx.currentTime);
      // 2秒かけて音量を0に下げる
      rainGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2);
      
      // フェードアウトが終わる2秒後に完全に停止させる
      const currentSource = rainSource; 
      setTimeout(() => {
        currentSource.stop();
        currentSource.disconnect();
      }, 2000);
    }
    clearTimeout(carTimer);
  }
});