import { Link, useRoute } from "wouter";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Plus } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
} from "recharts";

export default function PatientDetails() {
  const [, params] = useRoute("/therapist/patient/:id");
  const patientId = params?.id;
  const [newNote, setNewNote] = useState("");
  const [noteMode, setNoteMode] = useState<"general" | "session">("general");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [newMessage, setNewMessage] = useState("");
  const [newCheckIn, setNewCheckIn] = useState("");
  const [newCheckInDate, setNewCheckInDate] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [therapist, setTherapist] = useState<any>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setTherapist(JSON.parse(userData));
    }
  }, []);

  // Fetch patient data
  const { data: patient, isLoading: patientLoading } = useQuery({
    queryKey: ["/api/users/:userId", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const res = await fetch(`/api/users/${patientId}`);
      if (!res.ok) throw new Error("Failed to fetch patient");
      return res.json();
    },
  });

  // Fetch patient sessions
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["/api/users/:userId/sessions", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const [sessionsRes, exercisesRes] = await Promise.all([
        fetch(`/api/users/${patientId}/sessions`),
        fetch("/api/exercises"),
      ]);
      const sessionsData = await sessionsRes.json();
      const exercisesData = await exercisesRes.json();
      
      return sessionsData.map((session: any) => ({
        ...session,
        exerciseName: exercisesData.find((ex: any) => ex.id === session.exerciseId)?.name || "Exercise",
      }));
    },
  });

  // Fetch analytics
  const { data: analytics } = useQuery({
    queryKey: ["/api/users/:userId/analytics", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const res = await fetch(`/api/users/${patientId}/analytics`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  // Fetch therapist notes
  const { data: notes } = useQuery({
    queryKey: ["/api/patients/:patientId/notes", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/notes`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await fetch(`/api/patients/${patientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          therapistId: therapist?.id,
          note,
          sessionId: noteMode === "session" ? selectedSessionId || null : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create note");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/:patientId/notes", patientId] });
      setNewNote("");
      setNoteMode("general");
      setSelectedSessionId("");
      setShowNoteInput(false);
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["/api/patients/:patientId/messages", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/messages`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: checkIns } = useQuery({
    queryKey: ["/api/patients/:patientId/checkins", patientId],
    enabled: !!patientId,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/checkins`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/patients/${patientId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: therapist?.id,
          receiverId: patientId,
          message,
        }),
      });
      if (!res.ok) throw new Error("Failed to create message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/:patientId/messages", patientId] });
      setNewMessage("");
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

  const createCheckInMutation = useMutation({
    mutationFn: async ({ message, scheduledFor }: { message: string; scheduledFor?: string }) => {
      const res = await fetch(`/api/patients/${patientId}/checkins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          therapistId: therapist?.id,
          message,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create check-in");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients/:patientId/checkins", patientId] });
      setNewCheckIn("");
      setNewCheckInDate("");
      toast({ title: "Check-in added" });
    },
    onError: (error: any) => {
      toast({
        title: "Check-in failed",
        description: error?.message || "Unable to add check-in",
        variant: "destructive",
      });
    },
  });

  const handleAddNote = () => {
    if (noteMode === "session" && !selectedSessionId) {
      toast({
        title: "Select session",
        description: "Choose a session before saving a session-linked note.",
        variant: "destructive",
      });
      return;
    }
    if (newNote.trim()) {
      createNoteMutation.mutate(newNote);
    }
  };

  const handleAddMessage = () => {
    if (newMessage.trim()) {
      createMessageMutation.mutate(newMessage);
    }
  };

  const handleAddCheckIn = () => {
    if (newCheckIn.trim()) {
      createCheckInMutation.mutate({ message: newCheckIn, scheduledFor: newCheckInDate });
    }
  };

  // Prepare chart data
  const chartData = sessions?.slice(-10).map((session: any, index: number) => ({
    session: index + 1,
    stability: parseFloat(session.stability) || 0,
    smoothness: parseFloat(session.smoothness) || 0,
    accuracy: parseFloat(session.accuracy) || 0,
  })) || [];

  const formatDate = (dateString: string) => {
    const date = getSafeIstDate(dateString);
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = getSafeIstDate(dateString);
    return (
      date.toLocaleDateString([], { month: "short", day: "numeric", timeZone: "Asia/Kolkata" }) +
      ", " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) +
      " IST"
    );
  };

  const getSafeIstDate = (value: number | string | Date) => {
    const parsed = new Date(value);
    const now = Date.now();
    if (parsed.getTime() > now + 5 * 60 * 1000) {
      return new Date(parsed.getTime() - 5.5 * 60 * 60 * 1000);
    }
    return parsed;
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  useEffect(() => {
    if (!therapist?.id || !patientId || !messages) return;
    const key = `lastSeen_therapist_${therapist.id}_${patientId}`;
    const lastSeen = Number(localStorage.getItem(key) || 0);
    const unread = messages.filter(
      (m: any) => m.senderId !== therapist.id && new Date(m.createdAt).getTime() > lastSeen
    ).length;
    setUnreadCount(unread);
    localStorage.setItem(key, Date.now().toString());
  }, [therapist?.id, patientId, messages]);

  if (patientLoading) {
    return (
      <LayoutShell role="therapist">
        <div className="space-y-6">
          <Skeleton className="h-20" />
          <Skeleton className="h-96" />
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell role="therapist">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/therapist/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-heading">{patient?.fullName || patient?.username}</h1>
            <p className="text-muted-foreground">{patient?.condition || "Rehabilitation Patient"}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button 
              onClick={() => setShowNoteInput(!showNoteInput)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Note
            </Button>
          </div>
        </div>

        {showNoteInput && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Note type</p>
                  <Select value={noteMode} onValueChange={(v: "general" | "session") => setNoteMode(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose note type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General note</SelectItem>
                      <SelectItem value="session">Specific session note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {noteMode === "session" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Link to session</p>
                    <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a session" />
                      </SelectTrigger>
                      <SelectContent>
                        {(sessions || []).slice(0, 20).map((session: any) => (
                          <SelectItem key={session.id} value={session.id}>
                            {session.exerciseName} - {formatDateTime(session.createdAt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Textarea 
                placeholder="Enter your note for this patient..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowNoteInput(false)}>Cancel</Button>
                <Button onClick={handleAddNote} disabled={createNoteMutation.isPending}>
                  {createNoteMutation.isPending ? "Saving..." : "Save Note"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Recovery Trajectory</CardTitle>
              <CardDescription>Performance metrics over last 10 sessions</CardDescription>
            </CardHeader>
            <CardContent className="h-[350px]">
              {sessionsLoading ? (
                <Skeleton className="h-full" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="session" label={{ value: 'Sessions', position: 'insideBottomRight', offset: -5 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: "8px" }} />
                    <Line 
                      type="monotone" 
                      dataKey="stability" 
                      stroke="hsl(190, 85%, 35%)" 
                      strokeWidth={3}
                      name="Stability"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="smoothness" 
                      stroke="hsl(150, 60%, 45%)" 
                      strokeWidth={3}
                      strokeDasharray="5 5"
                      name="Smoothness"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="accuracy" 
                      stroke="hsl(280, 70%, 50%)" 
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      name="Accuracy"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No session data available
                </div>
              )}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Average Stability</p>
                  <p className="text-2xl font-bold">{analytics?.avgStability || 0}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Average Smoothness</p>
                  <p className="text-2xl font-bold">{analytics?.avgSmoothness || 0}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sessions Completed</p>
                  <p className="text-2xl font-bold">{analytics?.totalSessions || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Trend</p>
                  <p className={`text-2xl font-bold ${
                    analytics?.trend === 'improving' ? 'text-green-600' : 
                    analytics?.trend === 'declining' ? 'text-red-600' : 
                    'text-gray-600'
                  }`}>
                    {analytics?.trend === 'improving' ? '📈 Improving' : 
                     analytics?.trend === 'declining' ? '📉 Declining' : 
                     '➡️ Stable'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Patient Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Username</span>
                  <span>{patient?.username}</span>
                </div>
                {patient?.age && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Age</span>
                    <span>{patient.age}</span>
                  </div>
                )}
                {patient?.email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span>{patient.email}</span>
                  </div>
                )}
                {patient?.createdAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Date</span>
                    <span>{formatDate(patient.createdAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="notes" className="w-full">
          <TabsList>
            <TabsTrigger value="notes">Therapist Notes</TabsTrigger>
            <TabsTrigger value="history">Session History</TabsTrigger>
            <TabsTrigger value="messages">
              Messages
              {unreadCount > 0 && <Badge className="ml-2 h-5 px-2 text-[10px]">{unreadCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          </TabsList>
          <TabsContent value="notes" className="space-y-4 pt-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                {notes && notes.length > 0 ? (
                  notes.map((note: any, index: number) => (
                    <div key={note.id} className={index < notes.length - 1 ? "border-b pb-4" : ""}>
                      <div className="flex justify-between mb-2">
                        <div>
                          <p className="font-bold">{therapist?.fullName || "Therapist"}</p>
                          {note.sessionId && (
                            <p className="text-[11px] text-muted-foreground">
                              Linked session: {note.sessionId.slice(0, 8)}
                            </p>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{formatDateTime(note.createdAt)}</p>
                      </div>
                      <p className="text-muted-foreground">{note.note}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">No notes yet. Add your first note above.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <Card>
              <CardContent className="p-6">
                {sessionsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : sessions && sessions.length > 0 ? (
                  <div className="space-y-3">
                    {sessions.map((session: any) => (
                      <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{session.exerciseName}</p>
                          <p className="text-sm text-muted-foreground">{formatDateTime(session.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Stability: </span>
                              <span className="font-medium">{Math.round(parseFloat(session.stability) || 0)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Smoothness: </span>
                              <span className="font-medium">{Math.round(parseFloat(session.smoothness) || 0)}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Accuracy: </span>
                              <span className="font-medium">{Math.round(parseFloat(session.accuracy) || 0)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No sessions completed yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="messages" className="pt-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div ref={chatScrollRef} className="h-72 overflow-y-auto rounded-lg border bg-muted/20 p-3 space-y-2">
                  {messages && messages.length > 0 ? (
                    [...messages].reverse().map((msg: any) => {
                      const isTherapist = msg.senderId === therapist?.id;
                      return (
                        <div key={msg.id} className={`flex ${isTherapist ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${
                              isTherapist
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-card border rounded-bl-md"
                            }`}
                          >
                            <p className="text-[11px] opacity-80 mb-1">
                              {isTherapist
                                ? therapist?.fullName || "Therapist"
                                : patient?.fullName || patient?.username || "Patient"}
                            </p>
                            <p className="text-sm leading-relaxed">{msg.message}</p>
                            <p className="text-[10px] opacity-70 mt-1">{formatDateTime(msg.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Send a secure message to patient..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddMessage();
                    }}
                  />
                  <Button onClick={handleAddMessage} disabled={createMessageMutation.isPending}>
                    {createMessageMutation.isPending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="checkins" className="pt-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Create a quick check-in item..."
                    value={newCheckIn}
                    onChange={(e) => setNewCheckIn(e.target.value)}
                  />
                  <Input
                    type="datetime-local"
                    value={newCheckInDate}
                    onChange={(e) => setNewCheckInDate(e.target.value)}
                    className="w-[220px]"
                  />
                  <Button onClick={handleAddCheckIn} disabled={createCheckInMutation.isPending}>
                    Add
                  </Button>
                </div>

                {checkIns && checkIns.length > 0 ? (
                  checkIns.map((item: any) => (
                    <div key={item.id} className="border rounded-lg p-3">
                      <div className="flex justify-between mb-1">
                        <p className="font-medium">{therapist?.fullName || "Therapist"}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.scheduledFor ? `Check-in: ${formatDateTime(item.scheduledFor)}` : formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-4">No check-ins yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </LayoutShell>
  );
}
