import { getFirestore } from '@/db/firebase';
import { AgentMemory } from '@/db/schema';
import * as admin from 'firebase-admin';

const MEMORY_COLLECTION = 'memory';

const DEFAULT_MEMORY: AgentMemory = {
  successful_sources: [],
  blocked_sources: [],
  user_preferences: {},
  last_updated: null as any,
};

export async function loadMemory(agentName: string): Promise<AgentMemory> {
  const db = getFirestore();
  const snap = await db.collection(MEMORY_COLLECTION).doc(agentName).get();
  if (!snap.exists) return { ...DEFAULT_MEMORY };
  return { ...DEFAULT_MEMORY, ...snap.data() } as AgentMemory;
}

export async function saveMemory(agentName: string, updates: Partial<AgentMemory>): Promise<void> {
  const db = getFirestore();
  await db.collection(MEMORY_COLLECTION).doc(agentName).set(
    { ...updates, last_updated: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export async function updateMemoryAfterRun(
  agentName: string,
  successfulSources: string[],
  blockedSources: string[],
  preferenceUpdates: Record<string, unknown> = {}
): Promise<void> {
  const current = await loadMemory(agentName);
  const merged = {
    successful_sources: Array.from(new Set([...current.successful_sources, ...successfulSources])),
    blocked_sources: Array.from(new Set([...current.blocked_sources, ...blockedSources])),
    user_preferences: { ...current.user_preferences, ...preferenceUpdates },
  };
  await saveMemory(agentName, merged);
}
