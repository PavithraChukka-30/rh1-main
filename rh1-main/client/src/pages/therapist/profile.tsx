import { useEffect, useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function TherapistProfile() {
  const [user, setUser] = useState<any>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));
  }, []);

  const { data: patients = [] } = useQuery({
    queryKey: ["/api/therapists/:therapistId/patients", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/therapists/${user.id}/patients`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <LayoutShell role="therapist">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold font-heading">Therapist Profile</h1>
          <p className="text-muted-foreground">{user?.fullName || "Dr. Sarah Chen"}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Patients & Chat</CardTitle>
            <CardDescription>Open a patient to send secure messages and schedule check-ins.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {patients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assigned patients yet.</p>
            ) : (
              patients.map((patient: any) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">{patient.fullName || patient.username}</p>
                    <p className="text-xs text-muted-foreground">{patient.condition || "Rehabilitation"}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/therapist/patient/${patient.id}`)}
                  >
                    Open chat
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </LayoutShell>
  );
}
