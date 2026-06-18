import { useEffect, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp } from "lucide-react";
import { ProgressCharts } from "@/components/progress-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface SessionData {
  id: string;
  timestamp: number;
  stability: number;
  smoothness: number;
  accuracy: number;
  jitter: number;
  exerciseName: string;
  completionTime: number;
}

interface ProgressData {
  date: string;
  timestamp: number;
  stability: number;
  smoothness: number;
  accuracy: number;
  jitter: number;
}

export default function PatientProgress() {
  const [progressData, setProgressData] = useState<ProgressData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<
    'stability' | 'smoothness' | 'accuracy' | 'jitter'
  >('stability');
  const { toast } = useToast();

  useEffect(() => {
    fetchProgressData();
  }, []);

  const fetchProgressData = async () => {
    try {
      const userData = localStorage.getItem("user");
      if (!userData) return;

      const user = JSON.parse(userData);
      const [sessionsRes, exercisesRes] = await Promise.all([
        fetch(`/api/users/${user.id}/sessions`),
        fetch("/api/exercises"),
      ]);
      const data = await sessionsRes.json();
      const exercises = await exercisesRes.json();

      // Transform sessions to progress data
      const transformed = data.map((session: any) => ({
        date: new Date(session.createdAt).toLocaleDateString(),
        timestamp: new Date(session.createdAt).getTime(),
        stability: parseFloat(session.stability),
        smoothness: parseFloat(session.smoothness),
        accuracy: parseFloat(session.accuracy),
        jitter: session.jitter ? parseFloat(session.jitter) : 0,
      }));

      setProgressData(transformed);
      setSessions(
        data
          .map((session: any) => {
            const exercise = exercises.find((ex: any) => ex.id === session.exerciseId);
            return {
              id: session.id,
              timestamp: new Date(session.createdAt).getTime(),
              stability: parseFloat(session.stability),
              smoothness: parseFloat(session.smoothness),
              accuracy: parseFloat(session.accuracy),
              jitter: session.jitter ? parseFloat(session.jitter) : 0,
              exerciseName: exercise?.name || session.exerciseName || "Exercise",
              completionTime: parseFloat(session.completionTime),
            } as SessionData;
          })
          .sort((a: SessionData, b: SessionData) => b.timestamp - a.timestamp)
          .slice(0, 10)
      );
    } catch (error) {
      console.error("Error fetching progress data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatIstDate = (value: number | string | Date) =>
    getSafeIstDate(value).toLocaleDateString([], {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "Asia/Kolkata",
    });

  const formatIstTime = (value: number | string | Date) =>
    getSafeIstDate(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });

  const getSafeIstDate = (value: number | string | Date) => {
    const parsed = new Date(value);
    const now = Date.now();
    // If timestamp appears in future, apply corrective offset to avoid day rollover issues.
    if (parsed.getTime() > now + 5 * 60 * 1000) {
      return new Date(parsed.getTime() - 5.5 * 60 * 60 * 1000);
    }
    return parsed;
  };

  const handleExportReport = () => {
    if (!sessions.length) {
      toast({
        title: "No data to export",
        description: "Complete a few sessions first.",
        variant: "destructive",
      });
      return;
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const summaryRows = [
      ["Generated At (IST)", `${formatIstDate(new Date())} ${formatIstTime(new Date())} IST`],
      ["Total Sessions", String(sessions.length)],
      ["Average Stability", `${avg(sessions.map((s) => s.stability))}%`],
      ["Average Smoothness", `${avg(sessions.map((s) => s.smoothness))}%`],
      ["Average Accuracy", `${avg(sessions.map((s) => s.accuracy))}%`],
      ["Average Jitter", `${avg(sessions.map((s) => s.jitter))}%`],
    ];

    const sessionHeader = [
      "Date",
      "Time",
      "Exercise",
      "Stability",
      "Smoothness",
      "Accuracy",
      "Jitter",
      "DurationSeconds",
    ];

    const sessionRows = sessions.map((session) => {
      const date = new Date(session.timestamp);
      return [
        formatIstDate(date),
        `${formatIstTime(date)} IST`,
        session.exerciseName,
        `${session.stability}`,
        `${session.smoothness}`,
        `${session.accuracy}`,
        `${session.jitter}`,
        `${Math.ceil(session.completionTime)}`,
      ];
    });

    const toCsvLine = (row: string[]) =>
      row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");

    const csvContent = [
      "Patient Progress Report",
      "",
      ...summaryRows.map((r) => toCsvLine(r)),
      "",
      toCsvLine(sessionHeader),
      ...sessionRows.map((r) => toCsvLine(r)),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateTag = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `patient-progress-report-${dateTag}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: "Report exported", description: "CSV downloaded successfully." });
  };

  if (loading) {
    return (
      <LayoutShell role="patient">
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell role="patient">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-heading">Your Progress</h1>
            <p className="text-muted-foreground">Track your recovery journey over time.</p>
          </div>
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>

        {/* Main Charts */}
        <ProgressCharts
          data={progressData}
          selectedMetric={selectedMetric}
          onMetricSelect={setSelectedMetric}
        />

        {/* Session History */}
        {sessions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Session History</CardTitle>
              <CardDescription>Your recent exercise sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sessions.map(session => (
                  <div key={session.id} className="flex items-center justify-between py-3 px-4 border rounded-lg hover:bg-muted/50 transition">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <TrendingUp className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{session.exerciseName}</p>
                        <div className="text-sm text-muted-foreground leading-5">
                          <p>{formatIstDate(session.timestamp)}</p>
                          <p>{formatIstTime(session.timestamp)} IST</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="text-right">
                        <div className="text-muted-foreground text-xs">Stability</div>
                        <div className="font-bold">{session.stability}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground text-xs">Smoothness</div>
                        <div className="font-bold">{session.smoothness}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground text-xs">Accuracy</div>
                        <div className="font-bold">{session.accuracy}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground text-xs">Time</div>
                        <div className="font-bold">{Math.ceil(session.completionTime)}s</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </LayoutShell>
  );
}
