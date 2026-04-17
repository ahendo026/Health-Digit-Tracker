import { logger } from "./logger";

export type Classification =
  | "glucose_reading"
  | "blood_pressure_reading"
  | "weight_reading"
  | "meal_event"
  | "workout_event"
  | "unknown";

export interface AnalysisResult {
  classification: Classification;
  confidence: number;
  summary: string;
  data: {
    events?: Array<{
      eventType: string;
      eventTime?: string;
      value?: number;
      unit?: string;
      systolic?: number;
      diastolic?: number;
      notes?: string;
    }>;
    meals?: Array<{
      name?: string;
      mealTime?: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
      mealType?: string;
      foods?: string;
      notes?: string;
    }>;
    workouts?: Array<{
      workoutType?: string;
      workoutTime?: string;
      duration?: number;
      averageHeartRate?: number;
      maxHeartRate?: number;
      calories?: number;
      distance?: number;
      pace?: number;
      heartRateZones?: Record<string, number>;
      notes?: string;
    }>;
  };
}

const SAMPLE_RESULTS: AnalysisResult[] = [
  {
    classification: "glucose_reading",
    confidence: 0.93,
    summary: "Blood glucose reading of 98 mg/dL detected. Within normal fasting range.",
    data: {
      events: [
        {
          eventType: "glucose_reading",
          value: 98,
          unit: "mg/dL",
          notes: "Fasting glucose",
        },
      ],
    },
  },
  {
    classification: "blood_pressure_reading",
    confidence: 0.91,
    summary: "Blood pressure reading of 120/80 mmHg. Normal range.",
    data: {
      events: [
        {
          eventType: "blood_pressure_reading",
          systolic: 120,
          diastolic: 80,
          unit: "mmHg",
          notes: "Morning reading",
        },
      ],
    },
  },
  {
    classification: "weight_reading",
    confidence: 0.95,
    summary: "Body weight of 75.2 kg recorded.",
    data: {
      events: [
        {
          eventType: "weight_reading",
          value: 75.2,
          unit: "kg",
          notes: "Morning weight",
        },
      ],
    },
  },
  {
    classification: "meal_event",
    confidence: 0.88,
    summary: "Lunch meal logged: grilled chicken salad with approximately 450 calories.",
    data: {
      meals: [
        {
          name: "Grilled Chicken Salad",
          calories: 450,
          protein: 35,
          carbs: 22,
          fat: 18,
          fiber: 6,
          mealType: "lunch",
          foods: "Grilled chicken breast, mixed greens, cherry tomatoes, cucumber, olive oil dressing",
        },
      ],
    },
  },
  {
    classification: "workout_event",
    confidence: 0.89,
    summary: "45-minute outdoor run completed. Average heart rate 145 bpm, distance 6.2 km.",
    data: {
      workouts: [
        {
          workoutType: "running",
          duration: 45,
          averageHeartRate: 145,
          maxHeartRate: 172,
          calories: 380,
          distance: 6.2,
          pace: 7.26,
          heartRateZones: {
            zone1: 2,
            zone2: 8,
            zone3: 20,
            zone4: 12,
            zone5: 3,
          },
          notes: "Morning run, moderate effort",
        },
      ],
    },
  },
  {
    classification: "unknown",
    confidence: 0.45,
    summary: "Could not confidently classify this screenshot. Manual review recommended.",
    data: {},
  },
];

export async function analyzeScreenshot(filePath: string): Promise<AnalysisResult> {
  logger.info({ filePath }, "Running placeholder analysis");

  await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

  const result = SAMPLE_RESULTS[Math.floor(Math.random() * SAMPLE_RESULTS.length)];
  logger.info({ classification: result.classification, confidence: result.confidence }, "Analysis complete");
  return result;
}
