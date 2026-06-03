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
 * Returns the role for a user document that already exists in Firestore.
 * User documents are created during the /onboarding flow (Google sign-in).
 *
 * --- HOW TO PROMOTE A USER TO COPY TEAM ---
 * In the Firebase console, go to Firestore → users → {uid} and set:
 *   role: "copy_team"
 * ------------------------------------------
 */
export async function ensureUserDoc(uid: string): Promise<UserRole> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return (userSnap.data().role as UserRole) ?? "designer";
  }

  // Fallback for legacy docs that predate the onboarding flow.
  // Check legacy settings/admins so existing admins keep their access.
  const adminsSnap = await getDoc(doc(db, "settings", "admins"));
  const legacyAdmins: string[] = adminsSnap.exists()
    ? (adminsSnap.data()?.uids as string[]) ?? []
    : [];
  const role: UserRole = legacyAdmins.includes(uid) ? "copy_team" : "designer";

  await setDoc(userRef, { role, createdAt: serverTimestamp() });

  return role;
}

/**
 * Returns the role stored in users/{uid}.
 * If no document exists, lazily creates one via ensureUserDoc (which checks
 * the legacy settings/admins list so existing Copy Team members keep access).
 */
export async function getUserRole(uid: string): Promise<UserRole> {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    return (snap.data().role as UserRole) ?? "designer";
  }
  // No doc yet — create it now (checks legacy settings/admins)
  return ensureUserDoc(uid);
}

/** Returns true when the user has the copy_team role. */
export async function isCopyTeamUser(uid: string): Promise<boolean> {
  return (await getUserRole(uid)) === "copy_team";
}

/**
 * Returns the display name for a user: displayName → email → uid fallback.
 */
export async function getUserDisplayName(uid: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      const data = snap.data();
      return (data.displayName as string | undefined) ?? (data.email as string | undefined) ?? uid;
    }
  } catch {}
  return uid;
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
