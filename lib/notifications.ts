import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function createNotification(
  userId: string,
  requestId: string,
  requestTitle: string,
  message: string,
  type?: string
) {
  await addDoc(collection(db, "notifications"), {
    userId,
    requestId,
    requestTitle,
    message,
    read: false,
    createdAt: serverTimestamp(),
    ...(type ? { type } : {}),
  });
}
