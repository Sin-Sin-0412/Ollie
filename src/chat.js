import { supabase } from "./supabase.js";

// --- URLからの管理者判定（これは一番上でOK） ---
const urlParams = new URLSearchParams(window.location.search);

//* ここで秘密のURLを変えられる。getの中と、その後の "true" の中を変えればいい。
const isAdminMode = urlParams.get("key") === import.meta.env.VITE_ADMIN_KEY;

// --- ユーザー識別用のIDを取得または生成(ミュート機能のため) ---
let visitorId = localStorage.getItem("chat_visitor_id");
if (!visitorId) {
  // IDがなければ、ランダムな文字列（指紋のようなもの）を作って保存する
  visitorId =
    "id-" +
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
  localStorage.setItem("chat_visitor_id", visitorId);
}

//! 自動振り分け機能①
//* URLのパラメータから部屋名を取得する(自動部屋分け機能)
let currentRoomId = urlParams.get("room");

//* 部屋指定がない場合、1〜3番の部屋にランダムで振り分ける
if (!currentRoomId) {
  const randomRoomNum = Math.floor(Math.random() * 3) + 1; // 1〜3のランダム
  currentRoomId = randomRoomNum.toString();

  // ブラウザのURL欄をこっそり書き換える（ページはリロードされません）
  const adminKey = import.meta.env.VITE_ADMIN_KEY;
  const newUrl = `${window.location.pathname}?room=${currentRoomId}${window.location.search.includes(`key=${adminKey}`) ? `&key=${adminKey}` : ""}`;
  window.history.replaceState(null, "", newUrl);
}
//! 自動振り分け機能①

let isAuthorizedAdmin = false;
//* 監視モード切り替え判定
let isMonitorAllMode = false;

//* trueなら自由入力、falseなら定型文のみ
const IS_FREE_INPUT_MODE = false;

const PRESET_PHRASES = [
  "ZOMBANWA!",
  "i love you, ollie!",
  "halo!",
  "こんにちは〜！",
  "金魚釣れた？",
  "配信楽しみ！",
];

// チャットの表示件数
const MAX_MESSAGES = 100;

document.addEventListener("DOMContentLoaded", () => {
  // --- 0. 共通の変数（ここで定義すれば全体で使える） ---
  let mutedList = JSON.parse(
    localStorage.getItem("ollie_muted_list") || "[]",
  ).filter((user) => user && user.id); //* nullや壊れたデータを除去
  let ngWordsList = [];
  const messagesContainer = document.getElementById("chat-messages");
  const nameInput = document.getElementById("chat-name");

  // --- 1. 管理者認証チェックとUI ---
  const adminControls = document.getElementById("admin-only-controls");
  const adminClearBtn = document.getElementById("admin-clear-all-btn");

  // ----管理者モード切り替えスイッチ動作---
  const monitorToggle = document.getElementById("monitor-toggle");

  if (monitorToggle) {
    monitorToggle.addEventListener("change", (e) => {
      isMonitorAllMode = e.target.checked;
      //* モードが変わったので、メッセージを読み込み直す
      loadMessages();
    });
  }

  // --- 修正：Supabase Auth を使った管理者ログイン ---
  if (isAdminMode) {
    // すでにログイン済みかチェック
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        // ログイン済みなら管理者メニューを表示
        isAuthorizedAdmin = true;
        adminControls.classList.remove("hidden");
        document.getElementById("mute-section").classList.add("hidden");
        //* 定型文関数呼び出し
        initPresetUI();
      } else {
        // 未ログインならメールアドレスとパスワードを聞く
        const email = prompt("管理者メールアドレスを入力してください");
        const password = prompt("管理者パスワードを入力してください");

        if (email && password) {
          const { error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
          });

          if (error) {
            alert("ログイン失敗: " + error.message);
          } else {
            alert("管理者としてログインしました");
            location.reload(); // 権限を反映させるためにリロード
          }
        }
      }
    };

    checkSession();
  }

  //* 全削除ロジック
  if (adminClearBtn) {
    adminClearBtn.addEventListener("click", async () => {
      if (
        confirm(
          "【警告】全てのメッセージを削除しますか？この操作は戻せません。",
        )
      ) {
        // .neq("id", 0) ではなく、以下の書き方に変えます
        const { error } = await supabase
          .from("messages")
          .delete()
          .not("id", "is", null); // 「IDが空でないもの」＝ 全件 という意味

        if (error) {
          console.error("削除エラー:", error);
          alert("削除に失敗しました: " + error.message);
        } else {
          alert("メッセージを全消去しました");
          messagesContainer.innerHTML = "";
        }
      }
    });
  }

  // --- 2. 設定パネル（ミュート管理）のロジック ---
  const settingsBtn = document.getElementById("chat-settings-btn");
  const settingsPanel = document.getElementById("chat-settings-panel");
  const muteListContainer = document.getElementById("mute-list-container");

  // 歯車ボタンを押したときの処理（開く/閉じるを切り替え）
  settingsBtn.addEventListener("click", () => {
    const isOpening = !settingsPanel.classList.contains("show");

    if (isOpening) {
      // 閉じていたら、リストを更新して開く
      renderMuteList();
      settingsPanel.classList.add("show");
    } else {
      // 開いていたら閉じる
      settingsPanel.classList.remove("show");
    }
  });

  function renderMuteList() {
    muteListContainer.innerHTML = "";
    if (mutedList.length === 0) {
      muteListContainer.innerHTML =
        '<div style="font-size:12px; opacity:0.5;">ミュート中のユーザーはいません</div>';
      return;
    }

    // IDではなく、保存しておいた「名前」を表示に使う
    mutedList.forEach((user) => {
      const item = document.createElement("div");
      item.className = "mute-item";
      item.innerHTML = `
      <span>${user.name}</span>
      <button class="unmute-btn" data-id="${user.id}">解除</button>
    `;
      muteListContainer.appendChild(item);
    });

    document.querySelectorAll(".unmute-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.dataset.id;
        unmuteUser(id);
        renderMuteList(); // リストを再描画
      });
    });
  }

  function unmuteUser(id) {
    // IDが一致しないものだけ残す（＝指定したIDを削除）
    mutedList = mutedList.filter((user) => user.id !== id);
    localStorage.setItem("ollie_muted_list", JSON.stringify(mutedList));
    loadMessages();
  }

  // --- 3. チャットウィンドウの開閉ロジック ---
  const chatWindow = document.getElementById("chat-window");
  const chatToggleBtn = document.getElementById("chat-toggle");

  chatToggleBtn.addEventListener("click", () => {
    chatWindow.classList.toggle("show");
  });

  const chatCloseBtn = document.getElementById("chat-close");

  chatCloseBtn.addEventListener("click", () => {
    chatWindow.classList.remove("show"); // 霧の中に消えていく
  });

  //* --- 窓の外（何もないところ）をクリックしたら閉じる処理 ---
  document.addEventListener("mousedown", (e) => {
    // 窓が開いているときだけ判定
    if (chatWindow.classList.contains("show")) {
      // クリックされた場所が「チャット窓」でも「チャットボタン」でもなければ閉じる
      if (!chatWindow.contains(e.target) && !chatToggleBtn.contains(e.target)) {
        chatWindow.classList.remove("show");
      }
    }
  });

  // --- 4. チャット機能の準備（名前の復元など） ---
  const messageInput = document.getElementById("chat-input");
  const submitBtn = document.getElementById("chat-submit");

  const savedName = localStorage.getItem("ollie_chat_name");
  if (savedName) {
    nameInput.value = savedName;
  }

  // --- 5. メッセージ描画関数 ---
  function displayMessage(msg) {
    const isMuted = mutedList.some((user) => user?.id === msg.visitor_id);
    if (isMuted) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-message";
    // 削除時に特定のメッセージを特定できるよう、IDを付けておく
    msgDiv.id = `msg-${msg.id}`;
    msgDiv.dataset.sender = msg.sender_name;

    // --- 管理者の場合、特別なクラスを付与 ---
    if (msg.is_admin) {
      msgDiv.classList.add("admin-msg");
    }

    const senderSpan = document.createElement("span");
    senderSpan.className = "chat-sender";
    // 管理者なら名前も光らせる
    if (msg.is_admin) senderSpan.classList.add("admin-name");
    senderSpan.textContent = msg.sender_name;
    msgDiv.appendChild(senderSpan);

    // --- ボタンの出し分け ---
    if (isAuthorizedAdmin) {
      // 管理者本人には「削除ボタン(🗑️)」を出す
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️";
      delBtn.className = "delete-btn";
      delBtn.onclick = () => deleteMessage(msg.id);
      msgDiv.appendChild(delBtn);
    } else if (msg.sender_name !== nameInput.value) {
      // 一般ユーザーには「ミュートボタン(x)」を出す（自分以外）
      const muteBtn = document.createElement("button");
      muteBtn.textContent = "✕";
      muteBtn.className = "mute-btn";
      if (muteBtn) {
        muteBtn.onclick = () => muteUser(msg.visitor_id, msg.sender_name);
      }
      msgDiv.appendChild(muteBtn);
    }

    const contentNode = document.createTextNode(msg.content);
    msgDiv.appendChild(contentNode);
    messagesContainer.appendChild(msgDiv);

    while (messagesContainer.childNodes.length > MAX_MESSAGES) {
      messagesContainer.removeChild(messagesContainer.firstChild);
    }
    msgDiv.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  // --- 特定のメッセージを削除する ---
  async function deleteMessage(id) {
    if (confirm("このメッセージを削除しますか？（全員の画面から消えます）")) {
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) console.error("削除エラー:", error);
    }
  }

  function muteUser(id, name) {
    if (confirm(`${name} さんをミュートしますか？`)) {
      //* IDをリストに追加（重複チェック付き）
      if (!mutedList.some((user) => user.id === id)) {
        mutedList.push({ id: id, name: name });
        localStorage.setItem("ollie_muted_list", JSON.stringify(mutedList));
      }

      //* 画面からその人の発言（同じIDのもの）を即座に消す
      const targets = document.querySelectorAll(
        `.chat-message`, //* 一旦全部探して
      );
      targets.forEach((el) => {
        //* そのメッセージの要素にIDが紐付いていないため、ここでは再読み込みが一番確実です
      });

      alert(`${name} さんをミュートしました。`);
      loadMessages(); //* 再読み込みして画面をリフレッシュ
    }
  }

  // --- 6. システムメッセージ描画 ---
  function displaySystemMessage(text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-system-message";
    msgDiv.textContent = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (messagesContainer.childNodes.length > MAX_MESSAGES) {
      messagesContainer.removeChild(messagesContainer.firstChild);
    }
  }

  // --- NGワード読み込み --- //
  async function loadNGWords() {
    const { data, error } = await supabase.from("ng_words").select("word");

    if (error) {
      console.error("NGワード読み込みエラー:", error);
      return;
    }
    // 取得したデータを、さっき作った空の配列に詰め込む
    if (data) {
      ngWordsList = data.map((item) => item.word);
    }
  }

  // --- 告知を読み込む --- //
  async function loadAnnouncement() {
    const { data, error } = await supabase
      .from("announcements")
      .select("content")
      .single(); // 1行目だけ取得

    if (error) {
      console.error("告知読み込みエラー:", error);
      return;
    }

    if (data) {
      updateAnnouncementUI(data.content);
    }
  }

  // 告知エリアの見た目を更新するヘルパー関数
  function updateAnnouncementUI(content) {
    const announcementArea = document.getElementById("chat-announcement");
    const announcementText = document.getElementById("announcement-text");
    const editBtn = document.getElementById("admin-edit-announcement");

    if (content) {
      announcementText.textContent = content;
      announcementArea.classList.remove("hidden");
      // 管理者なら編集ボタンも出す
      if (isAuthorizedAdmin) {
        editBtn.classList.remove("hidden");
      }
    } else {
      announcementArea.classList.add("hidden");
    }
  }

  // --- 告知を編集する ---
  const editAnnouncementBtn = document.getElementById(
    "admin-edit-announcement",
  );
  if (editAnnouncementBtn) {
    editAnnouncementBtn.addEventListener("click", async () => {
      const currentText =
        document.getElementById("announcement-text").textContent;
      const newText = prompt(
        "新しい告知内容を入力してください（空欄で非表示）",
        currentText,
      );

      if (newText !== null) {
        const { error } = await supabase
          .from("announcements")
          .update({ content: newText })
          .eq("id", 1); // 最初の1行目を更新

        if (error) alert("更新エラー: " + error.message);
      }
    });
  }

  // --- 告知枠の開閉（アコーディオン）処理 ---
  const announcementArea = document.getElementById("chat-announcement");
  announcementArea.addEventListener("click", (e) => {
    //* もしクリックしたのが「編集」ボタンだった場合は、開閉処理をしない
    if (e.target.id === "admin-edit-announcement") return;

    //* それ以外の場所を触ったら、クラスを付け外しして開閉する
    const announcementText = document.getElementById("announcement-text");
    announcementText.classList.toggle("expanded");
  });

  // --- 7. 過去ログメッセージ読み込みと送信 ---
  async function loadMessages() {
    // * まず「メッセージを全部ください」というクエリの準備だけする（まだ実行しません）
    let query = supabase.from("messages").select("*");

    //* もし「全部屋監視モード」がOFFなら、今の部屋だけに絞り込む命令を追加する
    if (!isMonitorAllMode) {
      query = query.eq("room_id", currentRoomId);
    }

    //* 最後に並び替えと件数制限を付けて実行する
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES);

    if (error) {
      console.error("読み込みエラー:", error);
      return;
    }

    messagesContainer.innerHTML = "";
    //* 新しい順を逆転させて、古い順（下へ流れる）にして表示
    data.reverse().forEach((msg) => displayMessage(msg));
  }

  // --- 定型文ボタンの生成とUI制御 ---
  function initPresetUI() {
    const presetArea = document.getElementById("preset-phrase-area");
    const messageInput = document.getElementById("chat-input");

    if (IS_FREE_INPUT_MODE) {
      // 管理者の場合：ボタンを隠し、自由入力を許可
      presetArea.classList.add("hidden");
      messageInput.readOnly = false;
      messageInput.placeholder = "メッセージを入力 (Ctrl+Enterで送信)...";
    } else {
      // 一般ユーザーの場合：ボタンを表示し、入力を制限
      presetArea.classList.remove("hidden");
      presetArea.innerHTML = ""; // 初期化
      messageInput.readOnly = true;
      messageInput.placeholder = "下のボタンから選んでね";

      PRESET_PHRASES.forEach((phrase) => {
        const btn = document.createElement("button");
        btn.className = "preset-btn";
        btn.textContent = phrase;
        btn.onclick = () => {
          if (!submitBtn.disabled) {
            // 3秒ルールを守っている時だけ
            messageInput.value = phrase;
            sendMessage();
          }
        };
        presetArea.appendChild(btn);
      });
    }
  }

  async function sendMessage() {
    const name = nameInput.value.trim() || "名無し";
    const content = messageInput.value.trim();
    if (!content) return;

    //* 定型文if
    if (
      !IS_FREE_INPUT_MODE &&
      !isAuthorizedAdmin &&
      !PRESET_PHRASES.includes(content)
    ) {
      alert("今は定型文しか送れないよ！");
      return;
    }

    //* 名前の文字数チェック（15文字まで）
    if (name !== "名無し" && name.length > 10) {
      alert("名前は10文字以内にしてください。");
      return;
    }

    //* NGワードチェック（名前欄・判定前にスペースや一部の記号を消してチェック）
    const checkName = name.replace(/[\s　.,._-]/g, "");
    const isNameNG = ngWordsList.some((ngWord) => checkName.includes(ngWord));
    if (isNameNG) {
      alert("名前に不適切な言葉が含まれているため送信できません。");
      return;
    }
    //* NGワードチェック（メッセージ本文・判定前にスペースや一部の記号を消してチェック）
    const checkContent = content.replace(/[\s　.,._-]/g, "");
    const isNG = ngWordsList.some((ngWord) => checkContent.includes(ngWord));
    if (isNG) {
      alert("不適切な発言が含まれているため送信できません。");
      return;
    }

    submitBtn.disabled = true;
    localStorage.setItem("ollie_chat_name", name);
    nameInput.disabled = true;

    const { error } = await supabase.from("messages").insert([
      {
        sender_name: name,
        content: content,
        is_admin: isAuthorizedAdmin, // 管理者認証が通っていればtrueが入ります
        room_id: currentRoomId, //* 送信時に room_id を一緒に入れてメッセージテーブルに書き込む(部屋振り分け機能)
        visitor_id: visitorId, //* ミュート機能用個別ID
      },
    ]);

    if (error) {
      console.error("送信エラー:", error);
    } else {
      messageInput.value = "";
    }

    setTimeout(() => {
      submitBtn.disabled = false;
      messageInput.focus();
    }, 3000);
  }

  submitBtn.addEventListener("click", sendMessage);
  // 既存の keypress の部分は削除して、これに差し替え
  messageInput.addEventListener("keydown", (e) => {
    // Enter単体なら改行（何もしない）
    // Ctrl + Enter または Cmd + Enter の時だけ送信する
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault(); // 改行が入力されるのを防ぐ
      sendMessage();
    }
  });

  // --- 8. リアルタイム通信設定 ---
  const countDisplay = document.getElementById("connection-count");

  //*  チャンネル名に部屋IDを入れて、部屋ごとに別の回線を作る(部屋自動振り分け機能)
  const chatChannel = supabase.channel(`room-${currentRoomId}`, {
    config: {
      presence: {
        // 接続ごとにユニークなIDを発行する
        key: crypto.randomUUID(),
      },
    },
  });

  chatChannel
    .on("presence", { event: "sync" }, () => {
      const state = chatChannel.presenceState();
      const count = Object.keys(state).length;
      if (countDisplay) countDisplay.textContent = ` ${count}人のお客さん`;
    })
    .on(
      "presence",
      { event: "join", filter: { event: "join" } },
      ({ newPresences }) => {
        newPresences.forEach((p) => {
          if (p.name && p.name !== nameInput.value) {
            displaySystemMessage(`${p.name} さんが入室しました`);
          }
        });
      },
    )
    .on(
      "presence",
      { event: "leave", filter: { event: "leave" } },
      ({ leftPresences }) => {
        leftPresences.forEach((p) => {
          if (p.name) {
            displaySystemMessage(`${p.name} さんが退室しました`);
          }
        });
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" }, // 全ての変更(*)を監視 + DBの変更も、この部屋のものだけ受け取る(filter: `room_id=eq.${currentRoomId})(部屋自動振り分け)
      (payload) => {
        if (payload.eventType === "INSERT") {
          //* ここに「監視中」か「自分の部屋」かの判定を入れます
          if (isMonitorAllMode || payload.new.room_id === currentRoomId) {
            displayMessage(payload.new);
          }
        } else if (payload.eventType === "DELETE") {
          // 削除通知が届いたら、該当するIDの要素を画面から消す
          const el = document.getElementById(`msg-${payload.old.id}`);
          if (el) el.remove();
        }
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "announcements" },
      (payload) => {
        // 告知が更新されたら、その内容で画面を書き換える
        updateAnnouncementUI(payload.new.content);
      },
    )
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await chatChannel.track({
          name: nameInput.value || "名無し",
          online_at: new Date().toISOString(),
        });
      }
    });

  // ---- 右下ポップアップ ---- //

  const infoToggle = document.getElementById("info-toggle");
  const infoPopup = document.getElementById("info-popup");

  infoToggle.addEventListener("click", () => {
    const isOpening = !infoPopup.classList.contains("show");

    if (isOpening) {
      infoPopup.classList.add("show");
      // スマホ時のみ、チャットが開いていたら閉じる
      if (window.innerWidth <= 768) {
        chatWindow.classList.remove("show");
      }
    } else {
      infoPopup.classList.remove("show");
    }
  });

  // チャット側を開くときも、スマホならポップアップを閉じる
  chatToggleBtn.addEventListener("click", () => {
    if (!chatWindow.classList.contains("show") && window.innerWidth <= 768) {
      infoPopup.classList.remove("show");
    }
  });

  // ポップアップ外をクリックしても閉じる（以前作ったロジックの応用）
  document.addEventListener("mousedown", (e) => {
    if (infoPopup.classList.contains("show")) {
      if (!infoPopup.contains(e.target) && !infoToggle.contains(e.target)) {
        infoPopup.classList.remove("show");
      }
    }
  });

  // --- 初期化 ---
  loadMessages();
  loadNGWords();
  loadAnnouncement();
  //* 定型文関数呼び出し
  initPresetUI();
});
