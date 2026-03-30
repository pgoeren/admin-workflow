"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = __importStar(require("firebase-admin"));
const config_1 = __importDefault(require("@/config"));
async function initFirestore() {
    const app = admin.initializeApp({
        credential: admin.credential.cert({
            projectId: config_1.default.firebase.projectId,
            clientEmail: config_1.default.firebase.clientEmail,
            privateKey: config_1.default.firebase.privateKey,
        }),
    });
    const db = admin.firestore();
    console.log('Initializing Firestore collections...');
    // Create system config document
    await db.collection('config').doc('system').set({
        heartbeat_paused: false,
        morning_summary_cron: '0 7 * * *',
    }, { merge: true });
    console.log('✅ config/system created');
    // Create memory documents for each agent
    const agents = ['price-hunter', 'trip-scout', 'experience-finder', 'admin-assist', 'global'];
    for (const agent of agents) {
        await db.collection('memory').doc(agent).set({
            successful_sources: [],
            blocked_sources: [],
            user_preferences: {},
            last_updated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`✅ memory/${agent} created`);
    }
    console.log('\nFirestore initialized. Collections ready: tasks, results, memory, cache, token_log, config');
    process.exit(0);
}
initFirestore().catch((err) => {
    console.error('Failed to initialize Firestore:', err);
    process.exit(1);
});
