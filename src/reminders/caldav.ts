import { createDAVClient, DAVObject } from 'tsdav';
import { createTask } from '@/db/tasks';
import { getFirestore } from '@/db/firebase';
import { ListId } from '@/db/schema';

const LIST_NAME_TO_ID: Record<string, ListId> = {
  'price hunt': 'price-hunt',
  'trip planner': 'trip-planner',
  'experience scout': 'experience-scout',
  'admin': 'admin',
};

const SYNCED_UIDS_COLLECTION = 'synced_reminder_uids';

function parseVTodo(icsData: string): { uid: string; summary: string; status: string } | null {
  const lines = icsData.replace(/\r\n /g, '').replace(/\r\n\t/g, '').split(/\r\n|\n/);
  let uid = '';
  let summary = '';
  let status = '';
  let inVTodo = false;

  for (const line of lines) {
    if (line === 'BEGIN:VTODO') { inVTodo = true; continue; }
    if (line === 'END:VTODO') break;
    if (!inVTodo) continue;
    if (line.startsWith('UID:')) uid = line.slice(4).trim();
    if (line.startsWith('SUMMARY:')) summary = line.slice(8).trim();
    if (line.startsWith('STATUS:')) status = line.slice(7).trim();
  }

  if (!uid || !summary) return null;
  return { uid, summary, status };
}

export async function syncRemindersFromICloud(): Promise<number> {
  const appleId = process.env.ICLOUD_APPLE_ID;
  const appPassword = process.env.ICLOUD_APP_PASSWORD;

  if (!appleId || !appPassword) {
    console.log('iCloud credentials not configured — skipping Reminders sync');
    return 0;
  }

  const db = getFirestore();
  let synced = 0;

  const client = await createDAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username: appleId, password: appPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  const calendars = await client.fetchCalendars();

  for (const [listName, listId] of Object.entries(LIST_NAME_TO_ID)) {
    const calendar = calendars.find((c) => {
      const name = typeof c.displayName === 'string' ? c.displayName : String(c.displayName ?? '');
      return name.toLowerCase().trim() === listName;
    });
    if (!calendar) {
      console.log(`Reminders list not found: "${listName}"`);
      continue;
    }

    const objects: DAVObject[] = await client.fetchCalendarObjects({ calendar });

    for (const obj of objects) {
      const icsData = typeof obj.data === 'string' ? obj.data : '';
      const todo = parseVTodo(icsData);
      if (!todo) continue;
      if (todo.status === 'COMPLETED') continue;

      // Check if already synced
      const syncedDoc = await db.collection(SYNCED_UIDS_COLLECTION).doc(todo.uid).get();
      if (syncedDoc.exists) continue;

      // Queue in Firestore
      await createTask(todo.summary, listId);

      // Mark as completed in iCloud Reminders
      const completedIcs = icsData
        .replace(/STATUS:[^\r\n]*/g, 'STATUS:COMPLETED')
        .replace(/BEGIN:VTODO/, `BEGIN:VTODO\r\nCOMPLETED:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);

      await client.updateCalendarObject({
        calendarObject: { ...obj, data: completedIcs },
      });

      // Record as synced
      await db.collection(SYNCED_UIDS_COLLECTION).doc(todo.uid).set({
        synced_at: new Date(),
        title: todo.summary,
        list_id: listId,
      });

      console.log(`Queued from Reminders [${listId}]: ${todo.summary}`);
      synced++;
    }
  }

  return synced;
}
