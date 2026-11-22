/* EnglishUz Stage 6 — Firebase Authentication + Firestore learner profile.
   Uses the Firebase modular browser SDK. Configure assets/js/firebase-config.js first. */
const FIREBASE_VERSION = '13.3.0';
const FIREBASE_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const CONFIG = window.ENGLISHUZ_FIREBASE_CONFIG || {};
const REQUIRED_CONFIG = ['apiKey', 'authDomain', 'projectId', 'appId'];
const isConfigured = REQUIRED_CONFIG.every((key) => typeof CONFIG[key] === 'string' && CONFIG[key].trim() && !CONFIG[key].includes('YOUR_'));
const PROFILE_COLLECTION = 'users';
const LEARNING_DOC = 'private/learningState';
const SYNC_KEYS = [
  'englishuz_grammar_progress_v1',
  'englishuz_vocabulary_progress_v1',
  'englishuz_article_progress_v1',
  'englishuz_test_results_v1',
  'englishuz-theme',
  'englishuz_article_font_v1',
  'englishuz_activity_v1',
  'englishuz_smart_learning_v1'
];
const SYNC_META_KEY = 'englishuz_cloud_sync_meta_v1';
const SYNC_OWNER_KEY = 'englishuz_cloud_sync_owner_v1';
const ACCOUNT_CACHE_PREFIX = 'englishuz_account_cache_v1_';
let app, auth, db, authSdk, dbSdk;
let currentUser = null;
let currentProfile = null;
let syncTimer = null;
let syncBusy = false;
let syncWaiters = [];
let syncReady = false;
let applyingRemote = false;
let localWriteHooked = false;
let lastError = '';
let lastSyncStatus = 'idle';
let authStatus = isConfigured ? 'loading' : 'unconfigured';

const state = () => ({
  status: authStatus,
  user: currentUser ? {
    uid: currentUser.uid,
    displayName: currentUser.displayName || '',
    email: currentUser.email || '',
    photoURL: currentUser.photoURL || '',
    emailVerified: !!currentUser.emailVerified,
    providerId: currentUser.providerData?.[0]?.providerId || 'google.com',
    creationTime: currentUser.metadata?.creationTime || ''
  } : null,
  profile: currentProfile ? { ...currentProfile } : null,
  syncStatus: lastSyncStatus,
  message: lastError
});
function emit() {
  window.dispatchEvent(new CustomEvent('englishuz:auth-state', { detail: state() }));
}
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })])
    .finally(() => clearTimeout(timer));
}
function setStatus(status, message = '') {
  authStatus = status;
  lastError = message;
  emit();
}
function friendlyError(error) {
  const code = error?.code || '';
  const known = {
    'auth/popup-blocked': 'Brauzer Google login oynasini blokladi. Qayta urinib ko‘ring yoki popupga ruxsat bering.',
    'auth/popup-closed-by-user': 'Google login oynasi yopildi. Kirish yakunlanmadi.',
    'auth/cancelled-popup-request': 'Boshqa Google login oynasi allaqachon ochilgan.',
    'auth/unauthorized-domain': 'Bu sayt domeni Firebase Authentication → Authorized domains ro‘yxatiga qo‘shilmagan.',
    'auth/network-request-failed': 'Internet aloqasini tekshirib, qayta urinib ko‘ring.',
    'auth/operation-not-allowed': 'Firebase Console’da Google sign-in provayderi yoqilmagan.',
    'permission-denied': 'Firestore ruxsati rad etildi. firestore.rules faylini deploy qiling va foydalanuvchi UID qoidalarini tekshiring.',
    'unavailable': 'Firebase xizmati hozir javob bermayapti. Internetni tekshirib, keyin qayta urinib ko‘ring.'
  };
  return known[code] || error?.message || 'Kutilmagan xatolik yuz berdi. Firebase sozlamalarini tekshiring.';
}
function configMissingMessage() {
  return 'Google login uchun Firebase Web App konfiguratsiyasi kiritilmagan. README.md dagi 6-bosqich sozlash yo‘riqnomasini bajaring.';
}
function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
function localLearningState() {
  const result = {};
  for (const key of SYNC_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) result[key] = value;
  }
  return result;
}
function applyLocalLearningState(data) {
  applyingRemote = true;
  for (const key of SYNC_KEYS) {
    if (data && typeof data[key] === 'string') localStorage.setItem(key, data[key]);
    else localStorage.removeItem(key);
  }
  applyingRemote = false;
}
function accountMetaKey(uid) { return `${SYNC_META_KEY}_${uid}`; }
function profileRef(uid) { return dbSdk.doc(db, PROFILE_COLLECTION, uid); }
function learningRef(uid) { return dbSdk.doc(db, PROFILE_COLLECTION, uid, 'private', 'learningState'); }
function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
  return 0;
}
function defaultProfile(user) {
  return {
    uid: user.uid,
    displayName: user.displayName || 'O‘quvchi',
    email: user.email || '',
    photoURL: user.photoURL || '',
    englishLevel: 'Not sure',
    learningGoal: 'General English',
    dailyGoalMinutes: 30,
    providerId: 'google.com'
  };
}
async function loadOrCreateProfile(user) {
  const ref = profileRef(user.uid);
  const snapshot = await dbSdk.getDoc(ref);
  if (snapshot.exists()) {
    const data = snapshot.data();
    currentProfile = { ...defaultProfile(user), ...data };
    const refreshed = {
      uid: user.uid,
      displayName: user.displayName || data.displayName || 'O‘quvchi',
      email: user.email || '',
      photoURL: user.photoURL || '',
      providerId: 'google.com',
      updatedAt: dbSdk.serverTimestamp()
    };
    // Keep user-selected learning preferences; refresh only identity fields supplied by Google.
    await dbSdk.setDoc(ref, refreshed, { merge: true });
    currentProfile = { ...currentProfile, ...refreshed, displayName: refreshed.displayName };
  } else {
    const profile = {
      ...defaultProfile(user),
      createdAt: dbSdk.serverTimestamp(),
      updatedAt: dbSdk.serverTimestamp()
    };
    await dbSdk.setDoc(ref, profile, { merge: false });
    currentProfile = { ...profile, createdAtLabel: 'Bugun' };
  }
  emit();
}
async function pushLearningState(uid) {
  if (!uid || !db || !syncReady) return;
  if (syncBusy) return;
  syncBusy = true;
  lastSyncStatus = 'syncing'; emit();
  try {
    const payload = JSON.stringify(localLearningState());
    if (new TextEncoder().encode(payload).length > 700000) throw new Error('O‘quv ma’lumotlari hajmi bulut hujjati xavfsiz chegarasidan oshdi.');
    await dbSdk.setDoc(learningRef(uid), {
      stateJson: payload,
      clientUpdatedAt: Date.now(),
      updatedAt: dbSdk.serverTimestamp()
    }, { merge: true });
    const now = String(Date.now());
    localStorage.setItem(SYNC_META_KEY, now);
    if (uid) localStorage.setItem(accountMetaKey(uid), now);
    lastSyncStatus = 'synced';
    lastError = '';
  } catch (error) {
    lastSyncStatus = 'error';
    lastError = friendlyError(error);
  } finally {
    syncBusy = false;
    const waiters = syncWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
    emit();
  }
}
async function reconcileLearningState(uid) {
  lastSyncStatus = 'syncing'; emit();
  try {
    // Keep each Google account's local cache separate on shared devices.
    const previousOwner = localStorage.getItem(SYNC_OWNER_KEY);
    const accountCacheRaw = localStorage.getItem(`${ACCOUNT_CACHE_PREFIX}${uid}`);
    if (previousOwner && previousOwner !== uid) {
      const previousSnapshot = JSON.stringify(localLearningState());
      localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}${previousOwner}`, previousSnapshot);
      const targetCache = safeParse(accountCacheRaw || '', null);
      applyLocalLearningState(targetCache);
      const targetMeta = localStorage.getItem(accountMetaKey(uid)) || '0';
      localStorage.setItem(SYNC_META_KEY, targetMeta);
    } else if (!previousOwner && accountCacheRaw) {
      // The signed-out guest area is separate from a previously cached account.
      localStorage.setItem('englishuz_guest_cache_v1', JSON.stringify(localLearningState()));
      applyLocalLearningState(safeParse(accountCacheRaw, null));
      localStorage.setItem(SYNC_META_KEY, localStorage.getItem(accountMetaKey(uid)) || '0');
    }
    const snapshot = await dbSdk.getDoc(learningRef(uid));
    localStorage.setItem(SYNC_OWNER_KEY, uid);
    const localUpdatedAt = Number(localStorage.getItem(accountMetaKey(uid)) || localStorage.getItem(SYNC_META_KEY) || 0);
    if (snapshot.exists()) {
      const remote = snapshot.data();
      const remoteUpdatedAt = Math.max(toMillis(remote.updatedAt), Number(remote.clientUpdatedAt || 0));
      if (remoteUpdatedAt > localUpdatedAt && typeof remote.stateJson === 'string') {
        const state = safeParse(remote.stateJson, null);
        if (state && typeof state === 'object' && !Array.isArray(state)) {
          applyLocalLearningState(state);
          localStorage.setItem(SYNC_META_KEY, String(remoteUpdatedAt));
          localStorage.setItem(accountMetaKey(uid), String(remoteUpdatedAt));
          lastSyncStatus = 'synced';
          lastError = '';
          syncReady = true;
          return;
        }
      }
    }
    syncReady = true;
    await pushLearningState(uid);
  } catch (error) {
    applyingRemote = false;
    lastSyncStatus = 'error';
    lastError = friendlyError(error);
    emit();
  }
}
function scheduleLearningSync() {
  if (!currentUser || !syncReady || applyingRemote || !db) return;
  const now = String(Date.now());
  localStorage.setItem(SYNC_META_KEY, now);
  localStorage.setItem(accountMetaKey(currentUser.uid), now);
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushLearningState(currentUser?.uid), 1200);
}
function hookLocalStorage() {
  if (localWriteHooked) return;
  localWriteHooked = true;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && SYNC_KEYS.includes(String(key))) scheduleLearningSync();
  };
  Storage.prototype.removeItem = function(key) {
    originalRemoveItem.call(this, key);
    if (this === localStorage && SYNC_KEYS.includes(String(key))) scheduleLearningSync();
  };
  window.addEventListener('storage', (event) => {
    if (SYNC_KEYS.includes(event.key) && currentUser) scheduleLearningSync();
  });
}
async function signInWithGoogle() {
  if (!isConfigured) throw new Error(configMissingMessage());
  if (!auth) throw new Error(lastError || 'Firebase Authentication hali ishga tushmadi. Konfiguratsiya va internetni tekshiring.');
  const provider = new authSdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const mobile = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 720;
  try {
    if (mobile) {
      await authSdk.signInWithRedirect(auth, provider);
      return;
    }
    await authSdk.signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === 'auth/popup-blocked') {
      await authSdk.signInWithRedirect(auth, provider);
      return;
    }
    throw new Error(friendlyError(error));
  }
}
async function saveProfile(values) {
  if (!currentUser || !db) throw new Error('Profilni saqlash uchun avval Google hisobga kiring.');
  const displayName = String(values.displayName || '').trim();
  const allowedLevels = ['Not sure','A1','A2','B1','B2','C1','C2'];
  const allowedGoals = ['General English','CEFR','IELTS','School / University','Travel','Work'];
  const allowedGoalsMinutes = [15,30,45,60,90,120];
  if (displayName.length < 2 || displayName.length > 60) throw new Error('Ko‘rinadigan ism 2–60 belgi oralig‘ida bo‘lishi kerak.');
  if (!allowedLevels.includes(values.englishLevel)) throw new Error('Ingliz tili darajasi noto‘g‘ri tanlangan.');
  if (!allowedGoals.includes(values.learningGoal)) throw new Error('O‘quv maqsadi noto‘g‘ri tanlangan.');
  const dailyGoalMinutes = Number(values.dailyGoalMinutes);
  if (!allowedGoalsMinutes.includes(dailyGoalMinutes)) throw new Error('Kunlik maqsad noto‘g‘ri tanlangan.');
  await authSdk.updateProfile(currentUser, { displayName });
  const updated = {
    uid: currentUser.uid,
    displayName,
    email: currentUser.email || '',
    photoURL: currentUser.photoURL || '',
    englishLevel: values.englishLevel,
    learningGoal: values.learningGoal,
    dailyGoalMinutes,
    providerId: 'google.com',
    updatedAt: dbSdk.serverTimestamp()
  };
  await dbSdk.setDoc(profileRef(currentUser.uid), updated, { merge: true });
  currentProfile = { ...currentProfile, ...updated };
  emit();
}
async function signOut() {
  if (!auth) return;
  // Persist the last in-memory activity segment before flushing and clearing account state.
  window.dispatchEvent(new CustomEvent('englishuz:before-learning-state-change'));
  const signedOutUid = currentUser?.uid;
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (signedOutUid) {
    // Preserve the signed-in learner's data in an account-specific local cache.
    if (syncReady && db) await pushLearningState(signedOutUid);
    const snapshot = JSON.stringify(localLearningState());
    localStorage.setItem(`${ACCOUNT_CACHE_PREFIX}${signedOutUid}`, snapshot);
    localStorage.setItem(accountMetaKey(signedOutUid), String(Date.now()));
  }
  syncReady = false;
  // Keep the guest workspace separate; signing out does not delete the account's cached progress.
  applyLocalLearningState(null);
  localStorage.removeItem(SYNC_OWNER_KEY);
  localStorage.removeItem(SYNC_META_KEY);
  await authSdk.signOut(auth);
}
async function syncNow() {
  if (!currentUser) throw new Error('Avval Google hisobga kiring.');
  if (!syncReady) throw new Error('Hisob ma’lumotlari hali tayyorlanmoqda. Birozdan keyin qayta urinib ko‘ring.');
  if (syncBusy) await new Promise((resolve) => syncWaiters.push(resolve));
  else await pushLearningState(currentUser.uid);
  if (lastSyncStatus === 'error') throw new Error(lastError || 'Sinxronlash amalga oshmadi.');
}

window.EnglishUzAuth = {
  getState: state,
  signInWithGoogle,
  saveProfile,
  signOut,
  syncNow
};

async function boot() {
  hookLocalStorage();
  if (!isConfigured) {
    authStatus = 'unconfigured';
    lastError = configMissingMessage();
    emit();
    return;
  }
  try {
    const [appSdk, authenticationSdk, firestoreSdk] = await withTimeout(Promise.all([
      import(`${FIREBASE_BASE}/firebase-app.js`),
      import(`${FIREBASE_BASE}/firebase-auth.js`),
      import(`${FIREBASE_BASE}/firebase-firestore.js`)
    ]), 15000, 'Firebase SDK 15 soniyada yuklanmadi. Internet yoki CDN ulanishini tekshiring.');
    authSdk = authenticationSdk;
    dbSdk = firestoreSdk;
    app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(CONFIG);
    auth = authSdk.getAuth(app);
    db = dbSdk.getFirestore(app);
    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    authSdk.getRedirectResult(auth).catch((error) => {
      lastError = friendlyError(error);
      emit();
    });
    // Firebase should emit the first session immediately. This watchdog ensures
    // the profile page never remains on its loading spinner if it does not.
    const authObserverTimer = setTimeout(() => {
      if (authStatus === 'loading') {
        setStatus('error', 'Google hisob holati 12 soniyada aniqlanmadi. Internet, Firebase Auth va brauzer cookie sozlamalarini tekshiring.');
      }
    }, 12000);
    authSdk.onAuthStateChanged(auth, async (user) => {
      clearTimeout(authObserverTimer);
      const previousUid = currentUser?.uid || null;
      const nextUid = user?.uid || null;
      if (previousUid !== nextUid && nextUid) {
        window.dispatchEvent(new CustomEvent('englishuz:before-learning-state-change'));
        if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
      }
      currentUser = user || null;
      currentProfile = null;
      syncReady = false;
      if (!user) {
        lastSyncStatus = 'idle';
        setStatus('signedOut');
        window.dispatchEvent(new CustomEvent('englishuz:learning-state-ready', { detail: { uid: null } }));
        return;
      }
      // Show Google identity immediately; Firestore loads in the background.
      currentProfile = defaultProfile(user);
      authStatus = 'signedIn';
      lastError = '';
      lastSyncStatus = 'syncing';
      emit();
      try {
        await withTimeout(loadOrCreateProfile(user), 10000,
          'Profil ma’lumotlari 10 soniyada kelmadi. Firestore sozlamalari va internetni tekshiring.');
        try {
          await withTimeout(reconcileLearningState(user.uid), 12000,
            'O‘quv ma’lumotlarini sinxronlash 12 soniyada yakunlanmadi. Profil ochiq, keyinroq qayta urinib ko‘ring.');
        } catch (syncError) {
          lastSyncStatus = 'error';
          lastError = friendlyError(syncError);
        }
      } catch (error) {
        authStatus = 'signedIn';
        currentProfile = currentProfile || defaultProfile(user);
        lastSyncStatus = 'error';
        lastError = friendlyError(error);
      }
      window.dispatchEvent(new CustomEvent('englishuz:learning-state-ready', { detail: { uid: user.uid } }));
      emit();
    }, (error) => {
      clearTimeout(authObserverTimer);
      setStatus('error', friendlyError(error));
    });
  } catch (error) {
    setStatus('error', `Firebase SDK yuklanmadi: ${friendlyError(error)}. Internet aloqasi va Firebase CDN manzilini tekshiring.`);
  }
}
boot();
