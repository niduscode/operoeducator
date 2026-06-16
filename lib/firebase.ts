import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Evitar re-inicialización en hot reload
const app: FirebaseApp = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

// Firestore con cache EN MEMORIA (no IndexedDB).
//
// HISTORIA: antes usábamos persistentLocalCache + persistentMultipleTabManager
// para soporte offline, pero el tabManager de Firebase JS SDK 12.x se cuelga
// con frecuencia en producción (espera leader election que nunca completa
// si IndexedDB está bloqueado, extensiones intermedian o hay varias pestañas
// con datos viejos). Síntoma: pantallas en spinner infinito, ni siquiera
// llega a llamar el callback de onSnapshot.
//
// memoryLocalCache es la opción más rápida y predecible: inicialización
// instantánea, sin dependencias del navegador. La contraparte es que NO hay
// persistencia offline — si el usuario pierde conexión a mitad de uso, los
// datos en memoria sobreviven mientras la pestaña esté abierta, pero al
// recargar arranca limpio. Para una academia conectada por LAN/WiFi local
// esto es aceptable. Si en el futuro la app vive en tablets con conectividad
// intermitente, evaluar volver a persistente con singleTabManager (NO multi-tab).
//
// autoDetectLongPolling cubre redes corporativas / proxies que bloquean los
// WebSockets/streams que usa Firestore por defecto.
function buildFirestore(): Firestore {
  if (typeof window === "undefined") {
    return getFirestore(app);
  }
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
    });
  } catch (err) {
    // HMR ya inicializó. getFirestore devuelve la instancia existente.
    console.warn("firebase: initializeFirestore falló, fallback a getFirestore", err);
    return getFirestore(app);
  }
}

export const auth = getAuth(app);
export const db: Firestore = buildFirestore();
export const storage = getStorage(app);
export default app;
