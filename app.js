const firebaseConfig = {
  apiKey: "AIzaSyCQHpcqR8SqAD_R4640jlKbEs36KY1YIww",
  authDomain: "pipei-82419.firebaseapp.com",
  databaseURL: "https://pipei-82419-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pipei-82419",
  storageBucket: "pipei-82419.firebasestorage.app",
  messagingSenderId: "545440026002",
  appId: "1:545440026002:web:4cc9e5ce01757725b3c54b",
  measurementId: "G-E3T01KX6RH"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// 2. DOM 元素獲取
const usernameView = document.getElementById('username-view');
const usernameInput = document.getElementById('username-input');
const confirmUsernameBtn = document.getElementById('confirm-username-btn');
const lobbyDiv = document.getElementById('lobby');
const playerUsernameElem = document.getElementById('player-username');
const statusElem = document.getElementById('status');
const matchBtn = document.getElementById('match-btn');
const cancelBtn = document.getElementById('cancel-btn');
const readyCheckView = document.getElementById('ready-check-view');
const myReadyUsername = document.getElementById('my-ready-username');
const myReadyStatus = document.getElementById('my-ready-status');
const opponentReadyUsername = document.getElementById('opponent-ready-username');
const opponentReadyStatus = document.getElementById('opponent-ready-status');
const readyBtn = document.getElementById('ready-btn');
const declineBtn = document.getElementById('decline-btn');
const progressBar = document.getElementById('progress-bar');
const chatView = document.getElementById('chat-view');
const roomIdElem = document.getElementById('room-id');
const opponentUsernameElem = document.getElementById('opponent-username');
const leaveChatBtn = document.getElementById('leave-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const customAlertOverlay = document.getElementById('custom-alert-overlay');
const customAlertMessage = document.getElementById('custom-alert-message');
const customAlertCloseBtn = document.getElementById('custom-alert-close-btn');
function showSpinner() {
    loadingSpinner.classList.remove('hidden');
}
function hideSpinner() {
    loadingSpinner.classList.add('hidden');
}
function showAlert(message) {
    customAlertMessage.textContent = message;
    customAlertOverlay.classList.remove('hidden');
    // 使用一個微小的延遲來觸發 CSS 動畫
    setTimeout(() => {
        customAlertOverlay.classList.add('visible');
    }, 10);
}

function closeAlert() {
    customAlertOverlay.classList.remove('visible');
    // 等待動畫結束後再徹底隱藏
    setTimeout(() => {
        customAlertOverlay.classList.add('hidden');
    }, 400);
}

// 綁定關閉事件
customAlertCloseBtn.addEventListener('click', closeAlert);
customAlertOverlay.addEventListener('click', (event) => {
    // 如果點擊的是遮罩層本身，而不是彈窗盒子，則關閉
    if (event.target === customAlertOverlay) {
        closeAlert();
    }
});

// 3. 全域變數
let currentPlayer = null;
let myUsername = '';
let playerRef = null;
let roomRef = null;
let roomListener = null;
let chatRef = null;
let currentRoomId = null;
let readyCheckTimeout = null;
let roomPlayers = {};

// 4. 初始化流程
auth.signInAnonymously().catch(error => console.error("链接匿名服务器失败", error));
auth.onAuthStateChanged(user => {
    if (user) {
        currentPlayer = user;
        playerRef = db.ref(`players/${currentPlayer.uid}`);
        confirmUsernameBtn.disabled = false;
        confirmUsernameBtn.textContent = '设定终了';
        playerRef.once('value').then(snapshot => {
            const playerData = snapshot.val();
            if (playerData && playerData.username) {
                myUsername = playerData.username;
                if (playerData.roomId) {
                    enterRoom(playerData.roomId);
                } else {
                    goToLobby();
                }
            } else {
                usernameView.classList.remove('hidden');
            }
        });
        playerRef.on('value', playerSnapshot);
        playerRef.onDisconnect().remove();
    }
});
function playerSnapshot(snapshot) {
    const playerData = snapshot.val();
    if (playerData && playerData.roomId && !currentRoomId) {
        myUsername = playerData.username || myUsername;
        enterRoom(playerData.roomId);
    }
}

// 5. 用戶名與大廳邏輯
confirmUsernameBtn.addEventListener('click', setAndGoToLobby);
usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') setAndGoToLobby(); });
function setAndGoToLobby() {
    const username = usernameInput.value.trim();
    if (!username) { showAlert('昵称非法，请重新输入！'); return; }
    myUsername = username;
    showSpinner(); // 顯示 Spinner
    playerRef.child('username').set(myUsername)
        .then(goToLobby)
        .finally(hideSpinner); // 無論成功失敗都隱藏 Spinner
}
function goToLobby() {
    hideSpinner();
    usernameView.classList.add('hidden');
    readyCheckView.classList.add('hidden');
    chatView.classList.add('hidden');
    lobbyDiv.classList.remove('hidden');
    playerUsernameElem.textContent = myUsername;
    statusElem.textContent = '点击进入匹配队列';
    matchBtn.disabled = false;
    cancelBtn.classList.add('hidden');
    // BUGFIX: 這裡之前是 .add('hidden')，導致按鈕不見了。現已修正。
    matchBtn.classList.remove('hidden');
}

// 6. 匹配邏輯
matchBtn.addEventListener('click', startMatching);
cancelBtn.addEventListener('click', cancelMatching);
function startMatching() {
    statusElem.textContent = '正在匹配';
    matchBtn.disabled = true;
    cancelBtn.classList.remove('hidden');
    matchBtn.classList.add('hidden');
    const waitingPoolRef = db.ref('waiting_pool');
    const myWaitingRef = waitingPoolRef.child(currentPlayer.uid);
    myWaitingRef.set({ username: myUsername, timestamp: firebase.database.ServerValue.TIMESTAMP });
    myWaitingRef.onDisconnect().remove();
    waitingPoolRef.transaction(pool => {
        if (!pool) return { [currentPlayer.uid]: { username: myUsername, timestamp: firebase.database.ServerValue.TIMESTAMP } };
        const opponents = Object.keys(pool).filter(uid => uid !== currentPlayer.uid);
        if (opponents.length > 0) {
            const opponentId = opponents[0];
            const opponentData = pool[opponentId];
            createRoom(currentPlayer.uid, myUsername, opponentId, opponentData.username);
            delete pool[opponentId];
            delete pool[currentPlayer.uid];
            return pool;
        } else {
            pool[currentPlayer.uid] = { username: myUsername, timestamp: firebase.database.ServerValue.TIMESTAMP };
            return pool;
        }
    });
}
function cancelMatching() { db.ref(`waiting_pool/${currentPlayer.uid}`).remove(); goToLobby(); }

// 7. 房間生命週期管理
function createRoom(player1Id, player1Username, player2Id, player2Username) {
    const newRoomRef = db.ref('rooms').push();
    const roomId = newRoomRef.key;
    const roomData = {
        status: 'pending',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {
            [player1Id]: { username: player1Username, isReady: false },
            [player2Id]: { username: player2Username, isReady: false }
        }
    };
    newRoomRef.set(roomData).then(() => {
        db.ref(`players/${player1Id}`).update({ roomId: roomId });
        db.ref(`players/${player2Id}`).update({ roomId: roomId });
    });
}

function enterRoom(roomId) {
    currentRoomId = roomId;
    roomRef = db.ref(`rooms/${currentRoomId}`);
    roomListener = roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) { leaveRoom(); return; }
        const roomData = snapshot.val();
        const currentPlayers = roomData.players || {};
        if(Object.keys(roomPlayers).length > 0 && chatView.classList.contains('hidden') === false) {
            const previousPlayerIds = Object.keys(roomPlayers);
            const currentPlayerIds = Object.keys(currentPlayers);
            const leftPlayerId = previousPlayerIds.find(id => !currentPlayerIds.includes(id));
            if(leftPlayerId && leftPlayerId !== currentPlayer.uid){
                const leftPlayerUsername = roomPlayers[leftPlayerId].username;
                displaySystemMessage(`【${leftPlayerUsername}】退出了房间`);
            }
        }
        roomPlayers = currentPlayers;
        if (roomData.status === 'pending') {
            showReadyCheckScreen(roomData);
        } else if (roomData.status === 'active') {
            startChatSession(roomData);
        } else if (roomData.status === 'cancelled') {
            // 檢查 'declinedBy' 欄位是否存在，並且其值不是當前玩家的 uid
            if (roomData.declinedBy && roomData.declinedBy !== currentPlayer.uid) {
                // 如果是別人拒絕的，才對我顯示提示
                showAlert("对手拒绝或超时，即将返回大厅");
            }
            // 無論是誰拒絕的，雙方最終都會離開房間
            leaveRoom();
        }
    });
}

function showReadyCheckScreen(roomData) {
    const myData = roomData.players[currentPlayer.uid];
    const opponentId = Object.keys(roomData.players).find(id => id !== currentPlayer.uid);
    const opponentData = roomData.players[opponentId];

    if (!myData || !opponentData) return;

    // --- 樣式修正 ---
    // 無論何時都先更新玩家名稱和按鈕狀態
    myReadyUsername.textContent = myData.username;
    opponentReadyUsername.textContent = opponentData.username;
    readyBtn.disabled = myData.isReady;

    // 預先設定好文字，後續只控制透明度
    myReadyStatus.textContent = '就緒';
    opponentReadyStatus.textContent = '就緒';

    // 透過控制透明度來顯示或隱藏狀態，避免擠壓版面
    myReadyStatus.style.opacity = myData.isReady ? '1' : '0';
    opponentReadyStatus.style.opacity = opponentData.isReady ? '1' : '0';

    // --- 錯誤修正 ---
    // 只在準備畫面第一次顯示時，才初始化進度條和計時器
    if (readyCheckView.classList.contains('hidden')) {
        // 顯示準備畫面
        lobbyDiv.classList.add('hidden');
        chatView.classList.add('hidden');
        readyCheckView.classList.remove('hidden');

        // 初始化倒數計時
        clearTimeout(readyCheckTimeout);
        progressBar.style.transition = 'none'; // 先移除動畫效果
        progressBar.style.width = '100%';    // 立刻填滿
        
        // 使用一個極短的延遲來確保瀏覽器渲染了上面的樣式後，再啟動動畫
        setTimeout(() => {
            progressBar.style.transition = 'width 20s linear'; // 重新加上動畫
            progressBar.style.width = '0%';                   // 開始倒數
        }, 50); // 50毫秒延遲

        // 設定20秒後若狀態仍為 pending，則判定為取消
        readyCheckTimeout = setTimeout(() => {
            roomRef.once('value', (snapshot) => {
                const currentRoomData = snapshot.val();
                if (currentRoomData && currentRoomData.status === 'pending') {
                    roomRef.child('status').set('cancelled');
                }
            });
        }, 20000);
    }

// 綁定按鈕事件
    readyBtn.onclick = () => {
        showSpinner();
        roomRef.child(`players/${currentPlayer.uid}/isReady`).set(true).finally(hideSpinner);
    };
    declineBtn.onclick = () => {
        showSpinner();
        // 使用 update 一次更新多個值，並記錄是誰點擊了拒絕
        roomRef.update({
            status: 'cancelled',
            declinedBy: currentPlayer.uid 
        }).finally(hideSpinner);
    };

    // 檢查是否所有玩家都已準備就緒
    const allPlayers = Object.values(roomData.players);
    if (allPlayers.length > 1 && allPlayers.every(p => p.isReady)) {
        clearTimeout(readyCheckTimeout); // 兩人都準備好，清除自動取消的計時器
        setTimeout(() => {
            if(roomRef) roomRef.child('status').set('active');
        }, 1000); // 延遲1秒進入聊天室，給予玩家反應時間
    }
}

function startChatSession(roomData) {
    if (chatView.classList.contains('hidden')) {
        clearTimeout(readyCheckTimeout);
        readyCheckView.classList.add('hidden');
        chatView.classList.remove('hidden');
        const opponentId = Object.keys(roomData.players).find(id => id !== currentPlayer.uid);
        const opponentData = roomData.players[opponentId];
        roomIdElem.textContent = currentRoomId;
        opponentUsernameElem.textContent = opponentData.username;
        chatMessages.innerHTML = '';
        chatRef = db.ref(`chats/${currentRoomId}`);
        chatRef.on('child_added', displayMessage);
        sendBtn.onclick = sendTextMessage;
        chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendTextMessage(); };
        leaveChatBtn.onclick = leaveRoom;
    }
}

function leaveRoom() {
    // 1. 先解除監聽器，避免重複觸發
    if (roomRef && roomListener) roomRef.off('value', roomListener);
    if(chatRef) chatRef.off();
    clearTimeout(readyCheckTimeout);

    showSpinner(); // 新增：顯示加載動畫

    if (roomRef) {
        // 2. 執行異步的 remove() 操作
        roomRef.child('players').child(currentPlayer.uid).remove().then(() => {
            // 3. remove() 成功後，在 .then() 內執行後續所有操作
            roomRef.once('value', snapshot => {
                const roomData = snapshot.val();
                // 如果房間內已無玩家，則刪除房間和對應的聊天記錄
                if (!roomData || !roomData.players || Object.keys(roomData.players).length === 0) {
                    roomRef.remove();
                    if(chatRef) chatRef.remove();
                }

                // 4. 在所有資料庫操作都完成後，才進行本地變數清理和頁面跳轉
                if (playerRef) playerRef.child('roomId').remove();
                currentRoomId = null;
                roomRef = null;
                chatRef = null;
                roomListener = null;
                roomPlayers = {};
                goToLobby(); // 跳轉至大廳（此函數會處理隱藏Spinner）
            });
        }).catch(error => {
            // 如果 remove() 失敗，也強制執行清理和跳轉，避免卡住
            console.error("離開房間時出錯，強制清理:", error);
            if (playerRef) playerRef.child('roomId').remove();
            currentRoomId = null;
            roomRef = null;
            chatRef = null;
            roomListener = null;
            roomPlayers = {};
            goToLobby(); // 跳轉至大廳（此函數會處理隱藏Spinner）
        });
    } else {
        // 如果 roomRef 本來就是空的，直接去大廳
        goToLobby(); // 跳轉至大廳（此函數會處理隱藏Spinner）
    }
}

// 8. 聊天訊息函數
function displayMessage(snapshot) {
    const msg = snapshot.val(); if(!msg) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    if (msg.uid === currentPlayer.uid) {
        messageDiv.classList.add('my-message');
    } else {
        messageDiv.classList.add('opponent-message');
    }
    const senderP = document.createElement('p');
    senderP.classList.add('sender');
    senderP.textContent = msg.username;
    
    // 主要修改處：
    // 不再創建新的 <p> 元素，而是直接將淨化後的 HTML 插入 messageDiv
    // 這樣可以支持更複雜的 HTML 結構，例如 <p> <b>...</b> </p>
    messageDiv.appendChild(senderP);
    messageDiv.innerHTML += DOMPurify.sanitize(msg.text); // 使用 innerHTML 和 DOMPurify
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function displaySystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('system-message');
    messageDiv.textContent = text;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function sendTextMessage() {
    const text = chatInput.value.trim();
    if (text && chatRef) {
        const message = {
            uid: currentPlayer.uid,
            username: myUsername,
            text: text,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        chatRef.push(message); 
        chatInput.value = '';
    }
}