import { type User, type InsertUser, type Exercise, type Session, type Progress, type TherapistNote, type TherapistCheckIn, type PatientMessage, users, exercises, sessions, progress, therapistNotes, therapistCheckIns, patientMessages } from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc, and, inArray, isNull, sql } from "drizzle-orm";

// Database connection
const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getPatientsByTherapist(therapistId: string): Promise<User[]>;
  getTherapists(): Promise<User[]>;
  getUnassignedPatients(): Promise<User[]>;
  assignPatientsToTherapist(patientIds: string[], therapistId: string): Promise<void>;

  // Exercise methods
  getExercise(id: string): Promise<Exercise | undefined>;
  getExercises(): Promise<Exercise[]>;
  createExercise(exercise: any): Promise<Exercise>;

  // Session methods
  createSession(session: any): Promise<Session>;
  getSessionsByUser(userId: string): Promise<Session[]>;
  getSessionsByUserAndExercise(userId: string, exerciseId: string): Promise<Session[]>;
  getRecentSessions(userId: string, limit?: number): Promise<Session[]>;

  // Progress methods
  getProgressByUser(userId: string): Promise<Progress[]>;
  updateProgress(userId: string, exerciseId: string, session: Session): Promise<void>;

  // Therapist Notes methods
  getTherapistNotesByPatient(patientId: string): Promise<TherapistNote[]>;
  createTherapistNote(note: any): Promise<TherapistNote>;

  // Messages methods
  getMessagesByPatient(patientId: string): Promise<PatientMessage[]>;
  createMessage(message: any): Promise<PatientMessage>;

  // Check-ins methods
  getCheckInsByPatient(patientId: string): Promise<TherapistCheckIn[]>;
  createCheckIn(checkIn: any): Promise<TherapistCheckIn>;
}

export class PostgresStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async getPatientsByTherapist(therapistId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, "patient"));
  }

  async getTherapists(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, "therapist"));
  }

  async getUnassignedPatients(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(and(eq(users.role, "patient"), isNull(users.therapistId)));
  }

  async assignPatientsToTherapist(patientIds: string[], therapistId: string): Promise<void> {
    if (patientIds.length === 0) return;
    await db
      .update(users)
      .set({ therapistId, updatedAt: new Date() })
      .where(inArray(users.id, patientIds));
  }

  // Exercise methods
  async getExercise(id: string): Promise<Exercise | undefined> {
    const result = await db.select().from(exercises).where(eq(exercises.id, id));
    return result[0];
  }

  async getExercises(): Promise<Exercise[]> {
    return db.select().from(exercises);
  }

  async createExercise(exercise: any): Promise<Exercise> {
    const result = await db.insert(exercises).values(exercise).returning();
    return result[0];
  }

  // Session methods
  async createSession(session: any): Promise<Session> {
    const result = await db.insert(sessions).values(session).returning();
    return result[0];
  }

  async getSessionsByUser(userId: string): Promise<Session[]> {
    return db.select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt));
  }

  async getSessionsByUserAndExercise(userId: string, exerciseId: string): Promise<Session[]> {
    return db.select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.exerciseId, exerciseId)))
      .orderBy(desc(sessions.createdAt));
  }

  async getRecentSessions(userId: string, limit: number = 5): Promise<Session[]> {
    return db.select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(limit);
  }

  // Progress methods
  async getProgressByUser(userId: string): Promise<Progress[]> {
    return db.select()
      .from(progress)
      .where(eq(progress.userId, userId))
      .orderBy(desc(progress.updatedAt));
  }

  async updateProgress(userId: string, exerciseId: string, session: Session): Promise<void> {
    // Get existing progress or create new one
    const existingProgress = await db.select()
      .from(progress)
      .where(and(eq(progress.userId, userId), eq(progress.exerciseId, exerciseId)));

    const currentProgress = existingProgress[0];

    if (currentProgress) {
      // Update existing progress
      const totalSessions = (currentProgress.totalSessions || 0) + 1;
      const prevStability = Number(currentProgress.avgStability) || 0;
      const prevSmoothness = Number(currentProgress.avgSmoothness) || 0;
      const prevAccuracy = Number(currentProgress.avgAccuracy) || 0;
      const sessStability = Number(session.stability) || 0;
      const sessSmoothness = Number(session.smoothness) || 0;
      const sessAccuracy = Number(session.accuracy) || 0;
      
      const newAvgStability = (prevStability * (currentProgress.totalSessions || 0) + sessStability) / totalSessions;
      const newAvgSmoothness = (prevSmoothness * (currentProgress.totalSessions || 0) + sessSmoothness) / totalSessions;
      const newAvgAccuracy = (prevAccuracy * (currentProgress.totalSessions || 0) + sessAccuracy) / totalSessions;

      // Determine trend
      const improvement = (newAvgStability + newAvgSmoothness) - (prevStability + prevSmoothness);
      let trend = 'stable';
      if (improvement > 5) trend = 'improving';
      else if (improvement < -5) trend = 'declining';

      await db.update(progress)
        .set({
          avgStability: newAvgStability.toString(),
          avgSmoothness: newAvgSmoothness.toString(),
          avgAccuracy: newAvgAccuracy.toString(),
          totalSessions,
          lastSessionDate: session.createdAt,
          improvementTrend: trend,
          updatedAt: new Date(),
        })
        .where(eq(progress.id, currentProgress.id));
    } else {
      // Create new progress record
      await db.insert(progress).values({
        userId,
        exerciseId,
        avgStability: session.stability,
        avgSmoothness: session.smoothness,
        avgAccuracy: session.accuracy,
        totalSessions: 1,
        lastSessionDate: session.createdAt,
        improvementTrend: 'stable',
      });
    }
  }

  // Therapist Notes methods
  async getTherapistNotesByPatient(patientId: string): Promise<TherapistNote[]> {
    return db.select()
      .from(therapistNotes)
      .where(eq(therapistNotes.patientId, patientId))
      .orderBy(desc(therapistNotes.createdAt));
  }

  async createTherapistNote(note: any): Promise<TherapistNote> {
    const result = await db.insert(therapistNotes).values(note).returning();
    return result[0];
  }

  // Messages methods
  async getMessagesByPatient(patientId: string): Promise<PatientMessage[]> {
    return db.select()
      .from(patientMessages)
      .where(eq(patientMessages.patientId, patientId))
      .orderBy(desc(patientMessages.createdAt));
  }

  async createMessage(message: any): Promise<PatientMessage> {
    const result = await db.insert(patientMessages).values(message).returning();
    return result[0];
  }

  // Check-ins methods
  async getCheckInsByPatient(patientId: string): Promise<TherapistCheckIn[]> {
    return db.select()
      .from(therapistCheckIns)
      .where(eq(therapistCheckIns.patientId, patientId))
      .orderBy(desc(therapistCheckIns.createdAt));
  }

  async createCheckIn(checkIn: any): Promise<TherapistCheckIn> {
    const result = await db.insert(therapistCheckIns).values(checkIn).returning();
    return result[0];
  }
}

export const storage = new PostgresStorage();
