import "server-only";
import type { MeDTO } from "@/contracts/api";
import { findMyProfile, updateMyProfile } from "../repositories/me";
import type { Tx } from "../db";

// Сервис профиля (DS-10). В репозиторий — только данные, здесь ничего лишнего.

export async function getMyProfile(tx: Tx, studentId: string): Promise<MeDTO | null> {
  return findMyProfile(tx, studentId);
}

export async function patchMyProfile(
  tx: Tx,
  studentId: string,
  patch: { displayName?: string; onboardingDone?: boolean },
): Promise<MeDTO | null> {
  await updateMyProfile(tx, studentId, patch);
  return findMyProfile(tx, studentId);
}
