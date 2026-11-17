import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 파이어베이스 프로젝트 연결 설정
const firebaseConfig = {
  apiKey: "AIzaSyArsvrr91i14zle2l-NHGq1XaBqRrPf5bU",
  authDomain: "knucklehead-hunter.firebaseapp.com",
  databaseURL: "https://knucklehead-hunter-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "knucklehead-hunter",
  storageBucket: "knucklehead-hunter.firebasestorage.app",
  messagingSenderId: "916645723238",
  appId: "1:916645723238:web:cd112675c7279eae72c1a7",
  measurementId: "G-XRPSFQG2Y5"
};

// 파이어베이스 초기화 및 DB 연결
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 오늘 날짜 문자열 구하기 (예: "2026-11-18")
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 현재 시간 문자열 구하기 (예: "08:30:15")
function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// 파이어베이스에 기록 저장하는 함수
function recordAction(actionName) {
  const today = getTodayDateString();
  const logRef = ref(db, `attendance_log/${today}`);
  
  push(logRef, {
    timestamp: Date.now(),
    time_string: getCurrentTimeString(),
    action: actionName
  }).catch((error) => {
    alert("저장 중 오류가 발생했습니다: " + error.message);
  });
}

// 4개 버튼에 클릭 이벤트 연결
document.getElementById('btn-return').addEventListener('click', () => recordAction('업무 시작 / 자리 복귀'));
document.getElementById('btn-bed').addEventListener('click', () => recordAction('대기실 누움'));
document.getElementById('btn-avoid').addEventListener('click', () => recordAction('전화 회피'));
document.getElementById('btn-out').addEventListener('click', () => recordAction('외출 / 기타 이탈'));

// 오늘의 기록 실시간으로 불러와서 화면에 표시
const todayRef = ref(db, `attendance_log/${getTodayDateString()}`);
const logListEl = document.getElementById('log-list');

onValue(todayRef, (snapshot) => {
  logListEl.innerHTML = ''; // 기존 목록 초기화
  const data = snapshot.val();
  
  if (!data) {
    logListEl.innerHTML = '<li class="empty">오늘 기록된 내역이 없습니다.</li>';
    return;
  }

  // 최신 기록이 맨 위에 오도록 역순 정렬
  const entries = Object.values(data).reverse();
  
  entries.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="time">[${item.time_string}]</span> <span class="action">${item.action}</span>`;
    logListEl.appendChild(li);
  });
});