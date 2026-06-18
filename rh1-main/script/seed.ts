import { config } from "dotenv";
config(); // Load .env file

import { storage } from "../server/storage";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Create demo therapist
    const therapistPassword = await bcrypt.hash("password", 10);
    let therapist = await storage.getUserByUsername("therapist1");
    if (!therapist) {
      therapist = await storage.createUser({
        username: "therapist1",
        password: therapistPassword,
        email: "therapist@clinic.com",
        fullName: "Dr. Sarah Chen",
        role: "therapist",
      });
      console.log("✅ Created therapist:", therapist.username);
    } else {
      console.log("ℹ️ Therapist already exists:", therapist.username);
    }

    // Create demo patients
    const patientPassword = await bcrypt.hash("password", 10);

    let patient1 = await storage.getUserByUsername("patient1");
    if (!patient1) {
      patient1 = await storage.createUser({
        username: "patient1",
        password: patientPassword,
        email: "patient1@example.com",
        fullName: "Alex Johnson",
        role: "patient",
        age: 45,
        condition: "Stroke recovery",
        therapistId: therapist.id,
      });
      console.log("✅ Created patient:", patient1.username);
    } else {
      console.log("ℹ️ Patient already exists:", patient1.username);
    }

    let patient2 = await storage.getUserByUsername("patient2");
    if (!patient2) {
      patient2 = await storage.createUser({
        username: "patient2",
        password: patientPassword,
        email: "patient2@example.com",
        fullName: "Maria Garcia",
        role: "patient",
        age: 62,
        condition: "Parkinson's disease",
        therapistId: therapist.id,
      });
      console.log("✅ Created patient:", patient2.username);
    } else {
      console.log("ℹ️ Patient already exists:", patient2.username);
    }

    // Create exercises
    const circleExercise = await storage.createExercise({
      name: "Circle",
      description: "Draw a perfect circle with your index finger",
      difficulty: "easy",
      instructions: "Extend your index finger and draw a smooth circle in the air. Keep your movements steady and controlled.",
      targetShape: JSON.stringify({ type: "circle", radius: 100 }),
    });
    console.log("✅ Created exercise:", circleExercise.name);

    const squareExercise = await storage.createExercise({
      name: "Square",
      description: "Draw a square shape with your index finger",
      difficulty: "medium",
      instructions: "Extend your index finger and draw a square. Focus on sharp corners and straight lines.",
      targetShape: JSON.stringify({ type: "square", size: 150 }),
    });
    console.log("✅ Created exercise:", squareExercise.name);

    const lineExercise = await storage.createExercise({
      name: "Line",
      description: "Draw a straight horizontal line",
      difficulty: "easy",
      instructions: "Extend your index finger and draw a straight horizontal line from left to right.",
      targetShape: JSON.stringify({ type: "line", length: 200 }),
    });
    console.log("✅ Created exercise:", lineExercise.name);

    // Create some sample sessions for patient1
    const session1 = await storage.createSession({
      userId: patient1.id,
      exerciseId: circleExercise.id,
      completionTime: 25,
      stability: 78,
      smoothness: 82,
      accuracy: 85,
      pathData: JSON.stringify([]),
    });
    await storage.updateProgress(patient1.id, circleExercise.id, session1);

    const session2 = await storage.createSession({
      userId: patient1.id,
      exerciseId: squareExercise.id,
      completionTime: 35,
      stability: 72,
      smoothness: 75,
      accuracy: 78,
      pathData: JSON.stringify([]),
    });
    await storage.updateProgress(patient1.id, squareExercise.id, session2);

    console.log("✅ Created sample sessions and progress data");

    // Create therapist notes
    await storage.createTherapistNote({
      therapistId: therapist.id,
      patientId: patient1.id,
      sessionId: session1.id,
      note: "Excellent progress on circle exercises. Stability has improved by 15% this week. Continue practicing daily.",
    });

    await storage.createMessage({
      senderId: therapist.id,
      receiverId: patient1.id,
      patientId: patient1.id,
      message: "Great consistency today. Keep your wrist relaxed during circle tracing.",
    });

    await storage.createCheckIn({
      therapistId: therapist.id,
      patientId: patient1.id,
      message: "Practice 10 minutes of circle + line before 8 PM.",
    });

    console.log("✅ Created therapist notes, messages, and check-ins");

    console.log("\n🎉 Database seeded successfully!");
    console.log("\n📋 Demo Accounts:");
    console.log("Therapist: therapist1 / password");
    console.log("Patients: patient1 / password, patient2 / password");

  } catch (error) {
    console.error("❌ Error seeding database:", error);
  }
}

seed().catch(console.error);
