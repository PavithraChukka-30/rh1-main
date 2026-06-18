import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function PatientProfile() {
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [condition, setCondition] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["/api/users/:userId", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await fetch(`/api/users/${user.id}`);
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const { data: therapist } = useQuery({
    queryKey: ["/api/users/:therapistId", profile?.therapistId],
    enabled: !!profile?.therapistId,
    queryFn: async () => {
      const res = await fetch(`/api/users/${profile.therapistId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName || profile.username || "");
    setEmail(profile.email || "");
    setAge(profile.age != null ? String(profile.age) : "");
    setCondition(profile.condition || "");
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("User not found");
      const payload = {
        fullName: fullName.trim() || null,
        email: email.trim() || null,
        age: age.trim() ? Number(age) : null,
        condition: condition.trim() || null,
      };
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/:userId", user?.id] });
      const local = localStorage.getItem("user");
      if (local) {
        const parsed = JSON.parse(local);
        localStorage.setItem("user", JSON.stringify({ ...parsed, ...updatedUser }));
      }
      toast({ title: "Profile updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error?.message || "Could not update profile",
        variant: "destructive",
      });
    },
  });

  const initials = (profile?.fullName || profile?.username || "PT")
    .split(" ")
    .map((v: string) => v[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <LayoutShell role="patient">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold font-heading">My Profile</h1>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src="https://github.com/shadcn.png" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="text-center md:text-left space-y-1">
                <h2 className="text-2xl font-bold">{profile?.username || "patient"}</h2>
                <p className="text-muted-foreground">Patient ID: {profile?.id?.slice(0, 8) || "--"}</p>
                <p className="text-sm text-primary font-medium">
                  Rehab Plan: {profile?.condition || "Stroke recovery"}
                </p>
              </div>
              <div className="md:ml-auto">
                <Button variant="outline">Edit Photo</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Manage your contact details and preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="condition">Condition</Label>
                <Input id="condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
              </div>
            </div>
            
            <Separator className="my-4" />
            
            <div className="space-y-2">
              <Label>Assigned Therapist</Label>
              <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/50">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                  SC
                </div>
                <div>
                  <p className="font-medium">{therapist?.fullName || "Dr. Sarah Chen"}</p>
                  <p className="text-xs text-muted-foreground">Physiotherapist</p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </LayoutShell>
  );
}
