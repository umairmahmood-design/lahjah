import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export type UserRole = "designer" | "copy_team";

/**
 * Ensures a users/{uid} document exists in Firestore.
 * - If the doc already exists, returns its role.
 * - If missing, creates one with role "designer" by default.
 *   Exception: if the UID is listed in the legacy settings/admins document,
 *   the user gets role "copy_team" to preserve access during migration.
 *
 * Call this after every sign-in and sign-up.
 *
 * --- HOW TO PROMOTE A USER TO COPY TEAM ---
 * In the Firebase console, go to Firestore → users → {uid} and set:
 *   role: "copy_team"
 *
 * Or run this in a browser console while signed in as a superuser:
 *   import { doc, updateDoc } from "firebase/firestore";
 *   import { db } from "@/lib/firebase";
 *   await updateDoc(doc(db, "users", "<TARGET_UID>"), { role: "copy_team" });
 * ------------------------------------------
 */
export async function ensureUserDoc(uid: string): Promise<UserRole> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return (userSnap.data().role as UserRole) ?? "designer";
  }

  // New doc — check legacy settings/admins so existing admins keep their access
  const adminsSnap = await getDoc(doc(db, "settings", "admins"));
  const legacyAdmins: string[] = adminsSnap.exists()
    ? (adminsSnap.data()?.uids as string[]) ?? []
    : [];
  const role: UserRole = legacyAdmins.includes(uid) ? "copy_team" : "designer";

  await setDoc(userRef, { role, createdAt: serverTimestamp() });

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[lahjah] Created users/${uid} with role="${role}". ` +
        `To promote to copy_team: Firestore → users → ${uid} → set role: "copy_team"`
    );
  }

  return role;
}

/**
 * Returns the role stored in users/{uid}.
 * Falls back to "designer" if no document exists.
 */
export async function getUserRole(uid: string): Promise<UserRole> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return "designer";
  return (snap.data().role as UserRole) ?? "designer";
}

/** Returns true when the user has the copy_team role. */
export async function isCopyTeamUser(uid: string): Promise<boolean> {
  return (await getUserRole(uid)) === "copy_team";
}

/**
 * Returns the UIDs of every user with role "copy_team".
 * Used to fan out notifications to the whole Copy Team.
 */
export async function getCopyTeamUids(): Promise<string[]> {
  const snap = await getDocs(
    query(collection(db, "users"), where("role", "==", "copy_team"))
  );
  return snap.docs.map((d) => d.id);
}
