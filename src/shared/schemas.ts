import { z } from "zod";
export const choreSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  category: z.enum([
    "bedroom",
    "kitchen",
    "school",
    "pets",
    "outdoors",
    "family",
  ]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  points: z.number().int().min(1).max(1000),
  xp: z.number().int().min(1).max(1000),
  dueAt: z.string().datetime(),
  recurrence: z.enum(["none", "daily", "weekly"]),
  requiresApproval: z.boolean(),
  requiresProof: z.boolean(),
  assigneeIds: z.array(z.string()).min(1),
});
export const choreUpdateSchema = choreSchema.omit({ assigneeIds: true });
export const choreBulkSchema = z.object({
  assignmentIds: z.array(z.string()).min(1).max(500),
});
export const submissionSchema = z.object({
  note: z.string().trim().max(500).default(""),
  proofUrl: z.string().url().max(500).optional(),
});
export const decisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected", "changes_requested"]),
    note: z.string().trim().max(500).default(""),
  })
  .superRefine((v, c) => {
    if (v.decision !== "approved" && !v.note)
      c.addIssue({
        code: "custom",
        message: "Feedback is required",
        path: ["note"],
      });
  });
export const rewardSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  icon: z.string().max(8).default("🎁"),
  cost: z.number().int().min(1).max(100000),
  stock: z.number().int().min(0).max(10000),
  enabled: z.boolean(),
  requiresApproval: z.boolean(),
});
export const invitationSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["parent", "student"]),
});
export const reversalSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(128),
  familyName: z.string().trim().min(2).max(80),
});
export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(128),
});
const childProfile = {
  name: z.string().trim().min(2).max(80),
  age: z.number().int().min(3).max(21).optional(),
  gender: z.string().trim().max(40).optional(),
  interests: z.string().trim().max(200).optional(),
};
export const childSchema = z.object({
  ...childProfile,
  pin: z.string().regex(/^\d{4}$/, "Use a 4-digit PIN"),
});
export const childUpdateSchema = z.object({
  ...childProfile,
  pin: z
    .string()
    .regex(/^\d{4}$/, "Use a 4-digit PIN")
    .optional(),
});
export const studentLoginSchema = z.object({
  parentEmail: z.string().trim().email().max(200),
  name: z.string().trim().min(2).max(80),
  pin: z.string().regex(/^\d{4}$/, "Use a 4-digit PIN"),
});
export const preferencesSchema = z.object({
  theme: z.enum(["garden", "forest", "midnight", "ocean"]),
  animation: z.boolean(),
  reducedMotion: z.boolean(),
  sound: z.boolean(),
});
