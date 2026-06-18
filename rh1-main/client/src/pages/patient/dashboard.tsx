import { Link } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Zap, Play, MessageSquare, CalendarCheck2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function PatientDashboard() {
  const [user, setUser] = useState<any>(null);
  const [newMessage, setNewMessage] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // Fetch analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/users/:userId/analytics", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}/analytics`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  // Fetch recent sessions with exercise names
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/users/:userId/sessions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [sessionsRes, exercisesRes] = await Promise.all([
        fetch(`/api/users/${user.id}/sessions`),
        fetch("/api/exercises"),
      ]);
      const sessionsData = await sessionsRes.json();
      const exercisesData = await exercisesRes.json();
      
      // Map exercise IDs to names
      return sessionsData.slice(0, 3).map((session: any) => ({
        ...session,
        exerciseName: exercisesData.find((ex: any) => ex.id === session.exerciseId)?.name || "Exercise",
      }));
    },
  });

  // Fetch therapist notes
  const { data: notes } = useQuery({
    queryKey: ["/api/patients/:patientId/notes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${user.id}/notes`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["/api/patients/:patientId/messages", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${user.id}/messages`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: checkIns } = useQuery({
    queryKey: ["/api/patients/:patientId/checkins", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${user.id}/checkins`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["/api/users/:userId", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const { data: therapists } = useQuery({
    queryKey: ["/api/therapists"],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch("/api/therapists");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const targetTherapistId = profile?.therapistId || therapists?.[0]?.id || null;

  // Fetch therapist info if assigned
  const { data: therapist } = useQuery({
    queryKey: ["/api/users/:userId/therapist", profile?.therapistId],
    enabled: !!profile?.therapistId,
    queryFn: async () => {
      const res = await fetch(`/api/users/${profile.therapistId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!targetTherapistId) {
        throw new Error("No therapist assigned");
      }

      if (!profile?.therapistId) {
        await fetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ therapistId: targetTherapistId }),
        });
      }

      const res = await fetch(`/api/patients/${user.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          receiverId: targetTherapistId,
          message,
        }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/patients/:patientId/messages", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/:userId", user?.id] });
      toast({ title: "Message sent" });
    },
    onError: (error: any) => {
      toast({
        title: "Message failed",
        description: error?.message || "Unable to send message",
        variant: "destructive",
      });
    },
  });

  const getSafeIstDate = (value: string | Date) => {
    const parsed = new Date(value);
    const now = Date.now();
    // Some timestamps arrive effectively shifted by IST offset.
    if (parsed.getTime() > now + 5 * 60 * 1000) {
      return new Date(parsed.getTime() - 5.5 * 60 * 60 * 1000);
    }
    return parsed;
  };

  const formatDate = (dateString: string) => {
    const date = getSafeIstDate(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / 60000));
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins <= 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 0) return "Today, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return "Yesterday, " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getTrend = (trendStr: string): "up" | "down" | "neutral" => {
    if (trendStr === "improving") return "up";
    if (trendStr === "declining") return "down";
    return "neutral";
  };

  const formatCheckInDate = (dateString?: string) => {
    if (!dateString) return "No date set";
    const date = getSafeIstDate(dateString);
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
      ", " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !targetTherapistId) return;
    sendMessageMutation.mutate(newMessage);
  };

  const getCheckInStatus = (scheduledFor?: string) => {
    if (!scheduledFor) return { label: "Unscheduled", className: "bg-slate-100 text-slate-700 border-slate-200" };
    const scheduled = new Date(scheduledFor);
    const now = new Date();
    const sameDay =
      scheduled.getFullYear() === now.getFullYear() &&
      scheduled.getMonth() === now.getMonth() &&
      scheduled.getDate() === now.getDate();

    if (sameDay) return { label: "Today", className: "bg-amber-100 text-amber-800 border-amber-200" };
    if (scheduled.getTime() < now.getTime()) return { label: "Overdue", className: "bg-rose-100 text-rose-700 border-rose-200" };
    return { label: "Upcoming", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  useEffect(() => {
    if (!user?.id || !messages) return;
    const key = `lastSeen_patient_${user.id}`;
    const lastSeen = Number(localStorage.getItem(key) || 0);
    const unread = messages.filter(
      (m: any) => m.senderId !== user.id && new Date(m.createdAt).getTime() > lastSeen
    ).length;
    setUnreadCount(unread);

    localStorage.setItem(key, Date.now().toString());
  }, [user?.id, messages]);

  return (
    <LayoutShell role="patient">
      <div className="space-y-8">{/* Welcome Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold font-heading tracking-tight text-foreground">
              Hello, {user?.fullName?.split(' ')[0] || user?.username || "Patient"} 👋
            </h1>
            <p className="text-muted-foreground">
              Ready for your daily session? You're doing great!
            </p>
          </div>
          <Link href="/patient/exercise">
            <Button size="lg" className="rounded-full shadow-lg shadow-primary/20">
              <Play className="mr-2 h-5 w-5 fill-current" />
              Start New Session
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {analyticsLoading ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : (
            <>
              <MetricCard 
                title="Stability Score" 
                value={`${analytics?.avgStability || 0}%`}
                trend={getTrend(analytics?.trend || "stable")}
                trendValue="" 
                icon={Activity} 
                description="Average steadiness of hand movement"
              />
              <MetricCard 
                title="Smoothness" 
                value={`${analytics?.avgSmoothness || 0}%`}
                trend={getTrend(analytics?.trend || "stable")}
                trendValue="" 
                icon={Zap} 
                description="Consistency of motion path"
              />
              <MetricCard 
                title="Total Sessions" 
                value={`${analytics?.totalSessions || 0}`}
                trend="neutral" 
                trendValue="" 
                icon={Clock} 
                description="Total practice sessions completed"
              />
            </>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your last 3 sessions</CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : sessions && sessions.length > 0 ? (
                <div className="space-y-4">
                  {sessions.map((session: any, i: number) => {
                    const avgScore = Math.round(
                      ((parseFloat(session.stability) || 0) + 
                       (parseFloat(session.smoothness) || 0) + 
                       (parseFloat(session.accuracy) || 0)) / 3
                    );
                    return (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold">
                            {avgScore}
                          </div>
                          <div>
                            <p className="font-medium">{session.exerciseName}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(session.createdAt)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatDuration(parseFloat(session.completionTime) || 0)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No sessions yet. Start your first exercise!</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-primary text-primary-foreground border-none shadow-md overflow-hidden relative">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            
            <CardHeader>
              <CardTitle className="text-primary-foreground">Therapist Note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 relative z-10">
              {notes && notes.length > 0 ? (
                <>
                  <blockquote className="text-lg font-medium italic opacity-90">
                    "{notes[0].note}"
                  </blockquote>
                  <div className="flex items-center gap-3 pt-4">
                    <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="font-bold">{therapist?.fullName?.substring(0, 2).toUpperCase() || "Dr"}</span>
                    </div>
                    <div>
                      <p className="font-bold">{therapist?.fullName || "Your Therapist"}</p>
                      <p className="text-xs opacity-70">Physical Therapist</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="opacity-90">No therapist notes yet. Keep up the good work!</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarCheck2 className="h-4 w-4 text-primary" />
                Check-Ins from your therapist
              </CardTitle>
              <CardDescription>Scheduled reminders and follow-ups.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {checkIns && checkIns.length > 0 ? (
                checkIns.slice(0, 3).map((item: any) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.message}</p>
                      <Badge variant="outline" className={getCheckInStatus(item.scheduledFor).className}>
                        {getCheckInStatus(item.scheduledFor).label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.scheduledFor ? `Scheduled: ${formatCheckInDate(item.scheduledFor)}` : `Created: ${formatDate(item.createdAt)}`}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No check-ins yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Messages
                {unreadCount > 0 && <Badge className="ml-1 h-5 px-2 text-[10px]">{unreadCount}</Badge>}
              </CardTitle>
              <CardDescription>Secure chat with your therapist.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div ref={chatScrollRef} className="h-56 overflow-y-auto rounded-lg border bg-muted/20 p-3 space-y-2">
                {messages && messages.length > 0 ? (
                  [...messages]
                    .slice(0, 20)
                    .reverse()
                    .map((msg: any) => {
                      const isMe = msg.senderId === user?.id;
                      return (
                        <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${
                              isMe
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-card border rounded-bl-md"
                            }`}
                          >
                            <p className="text-[11px] opacity-80 mb-1">
                              {isMe ? "You" : therapist?.fullName || "Therapist"}
                            </p>
                            <p className="text-sm leading-relaxed">{msg.message}</p>
                            <p className="text-[10px] opacity-70 mt-1">{formatDate(msg.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No messages yet.</p>
                )}
              </div>
              {!targetTherapistId && (
                <p className="text-xs text-destructive">No therapist available for messaging.</p>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendMessage();
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={sendMessageMutation.isPending || !targetTherapistId}
                >
                  {sendMessageMutation.isPending ? "Sending..." : "Send"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </LayoutShell>
  );
}
