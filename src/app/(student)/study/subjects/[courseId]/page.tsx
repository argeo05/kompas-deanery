import type { Metadata } from "next";
import { SubjectScreen } from "@/components/study/subject-screen";

export const metadata: Metadata = { title: "Дисциплина — Компас" };

export default async function SubjectPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  return <SubjectScreen courseId={courseId} />;
}
