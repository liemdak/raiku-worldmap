import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =============================================
// PASTE YOUR FIREBASE CONFIG HERE
// =============================================
const firebaseConfig = {
    apiKey: "AIzaSyDETZgQDs2cxglNzLZyNy4DWsWiVa00w0c",
    authDomain: "raiku-world.firebaseapp.com",
    projectId: "raiku-world",
    storageBucket: "raiku-world.firebasestorage.app",
    messagingSenderId: "296992088930",
    appId: "1:296992088930:web:ae954fecd0f55a025a823b"
};
// =============================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function saveCheckin(data) {
    try {
        const docRef = await addDoc(collection(db, "checkins"), {
            name:     data.name,
            city:     data.city,
            contact:  data.contact || "",
            country:  data.country || data.city,
            lat:      data.lat,
            lng:      data.lng,
            streak:   data.streak || 1,
            deviceId: data.deviceId || "",
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (e) {
        console.error("Error saving checkin:", e);
        throw e;
    }
}

export function listenCheckins(callback) {
    const q = query(
        collection(db, "checkins"),
        orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snapshot) => {
        const pins = [];
        snapshot.forEach((doc) => {
            pins.push({ id: doc.id, ...doc.data() });
        });
        callback(pins);
    });
}
