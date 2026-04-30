import { supabase } from "./supabase.js";

// 画面の要素を取得
const loginSection = document.getElementById("login-section");
const dashboardSection = document.getElementById("dashboard-section");
const logoutBtn = document.getElementById("logout-btn");
const loginError = document.getElementById("login-error");

// 2. ログイン状態の確認（ページを開いたときに実行される）
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    // ログイン済みならダッシュボードを見せる
    loginSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");

    //* ログインが成功した時にリストを読み込む
    loadNGWordsAdmin();     // NGワードを読み込む
    loadAnnouncementAdmin(); // 告知を読み込む
    loadMessagesAdmin();     // ログを読み込む

  } else {
    // ログインしていないならログイン画面を見せる
    loginSection.classList.remove("hidden");
    dashboardSection.classList.add("hidden");
    logoutBtn.classList.add("hidden");
  }
}

// 3. ログインボタンを押した時の処理
document.getElementById("login-btn").addEventListener("click", async () => {
  const email = document.getElementById("admin-email").value;
  const password = document.getElementById("admin-password").value;

  const { error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    loginError.textContent = "ログイン失敗: " + error.message;
  } else {
    loginError.textContent = "";
    checkSession(); // 成功したら画面を切り替える
  }
});

// 4. ログアウト処理
logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  checkSession();
});

// 一番最初にログイン状態をチェックする
checkSession();


// --- NGワード管理機能 ---
const ngWordList = document.getElementById("ng-word-list");
const newNgWordInput = document.getElementById("new-ng-word");
const addNgBtn = document.getElementById("add-ng-btn");

// 1. NGワードをデータベースから読み込む
async function loadNGWordsAdmin() {
  const { data, error } = await supabase
    .from("ng_words")
    .select("*")
    .order("id", { ascending: false }); // 新しい順に並べる

  if (error) {
    console.error("NGワード読み込みエラー:", error);
    return;
  }

  // リストを一度空にしてから再構築する
  ngWordList.innerHTML = "";
  data.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.word;

    // 個別の削除ボタンを作成
    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.className = "delete-btn";
    delBtn.onclick = () => deleteNGWord(item.id);

    li.appendChild(delBtn);
    ngWordList.appendChild(li);
  });
}

// --- 告知管理 ---
const announcementInput = document.getElementById("announcement-input");
const currentAnnouncementText = document.getElementById("current-announcement");
const updateAnnouncementBtn = document.getElementById("update-announcement-btn");

// 告知の読み込み
async function loadAnnouncementAdmin() {
  const { data, error } = await supabase.from("announcements").select("content").eq("id", 1).single();
  if (data) {
    currentAnnouncementText.textContent = `現在の告知: ${data.content}`;
    announcementInput.value = data.content;
  }
}

// 告知の更新
updateAnnouncementBtn.addEventListener("click", async () => {
  const newContent = announcementInput.value.trim();
  const { error } = await supabase.from("announcements").update({ content: newContent }).eq("id", 1);
  if (error) alert("更新エラー: " + error.message);
  else loadAnnouncementAdmin();
});

// --- メッセージログ管理 ---
const adminMessagesList = document.getElementById("admin-messages-list");

async function loadMessagesAdmin() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return;

  adminMessagesList.innerHTML = "";
  data.forEach(msg => {
    const div = document.createElement("div");
    div.className = "log-item";
    div.innerHTML = `
      <div class="log-info">
        <span class="log-sender">${msg.sender_name}</span>
        <span class="log-content">${msg.content}</span>
      </div>
      <button class="delete-btn" data-id="${msg.id}">削除</button>
    `;
    
    // 削除ボタンのイベント
    div.querySelector(".delete-btn").onclick = () => deleteMessageAdmin(msg.id);
    adminMessagesList.appendChild(div);
  });
}

async function deleteMessageAdmin(id) {
  if (!confirm("このメッセージを完全に削除しますか？")) return;
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) alert("削除エラー: " + error.message);
  else loadMessagesAdmin();
}

// 2. 新しいNGワードを追加する
addNgBtn.addEventListener("click", async () => {
  const word = newNgWordInput.value.trim();
  if (!word) return;

  const { error } = await supabase.from("ng_words").insert([{ word: word }]);
  
  if (error) {
    alert("追加エラー: " + error.message);
  } else {
    newNgWordInput.value = ""; // 入力欄を空にする
    loadNGWordsAdmin(); // リストを最新状態に更新
  }
});

// 3. NGワードを削除する
async function deleteNGWord(id) {
  if (!confirm("このNGワードを削除しますか？")) return;
  
  const { error } = await supabase.from("ng_words").delete().eq("id", id);
  
  if (error) {
    alert("削除エラー: " + error.message);
  } else {
    loadNGWordsAdmin(); // リストを最新状態に更新
  }
}