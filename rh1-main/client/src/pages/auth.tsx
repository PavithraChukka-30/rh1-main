import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, User, Stethoscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [patientUsername, setPatientUsername] = useState("patient1");
  const [patientPassword, setPatientPassword] = useState("password");
  const [therapistUsername, setTherapistUsername] = useState("therapist1");
  const [therapistPassword, setTherapistPassword] = useState("password");
  const [newPatientUsername, setNewPatientUsername] = useState("");
  const [newPatientPassword, setNewPatientPassword] = useState("");

  const handleLogin = async (role: "patient" | "therapist") => {
    const username = role === "patient" ? patientUsername : therapistUsername;
    const password = role === "patient" ? patientPassword : therapistPassword;

    setLoading(true);
    try {
      let response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      // If demo account doesn't exist yet, auto-create and retry login.
      if (!response.ok && username && password) {
        await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, role }),
        });

        response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
      }

      if (!response.ok) {
        throw new Error("Unable to login");
      }

      const user = await response.json();
      localStorage.setItem("user", JSON.stringify(user));

      setLoading(false);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.role}.`,
      });
      setLocation(user.role === "patient" ? "/patient/dashboard" : "/therapist/dashboard");
    } catch (error) {
      setLoading(false);
      toast({
        title: "Login failed",
        description: "Please check your username and password.",
        variant: "destructive",
      });
    }
  };

  const handlePatientSignup = async () => {
    const username = newPatientUsername.trim();
    const password = newPatientPassword;

    if (!username || !password) {
      toast({
        title: "Missing details",
        description: "Enter username and password to create a patient account.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role: "patient" }),
      });

      if (!registerRes.ok) {
        const errorData = await registerRes.json().catch(() => null);
        throw new Error(errorData?.error || "Unable to create account");
      }

      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!loginRes.ok) {
        throw new Error("Account created, but login failed");
      }

      const user = await loginRes.json();
      localStorage.setItem("user", JSON.stringify(user));

      toast({
        title: "Account created",
        description: "Your patient account is ready.",
      });
      setLocation("/patient/dashboard");
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error?.message || "Could not create patient account.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2 font-heading font-bold text-3xl text-primary">
        <Activity className="h-10 w-10" />
        <span>Air Canvas</span>
      </div>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Sign in to your account</CardTitle>
          <CardDescription>
            Choose your portal to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="patient" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 h-12">
              <TabsTrigger value="patient" className="h-10 text-md">
                <User className="w-4 h-4 mr-2" />
                Patient
              </TabsTrigger>
              <TabsTrigger value="therapist" className="h-10 text-md">
                <Stethoscope className="w-4 h-4 mr-2" />
                Therapist
              </TabsTrigger>
            </TabsList>

            <TabsContent value="patient">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="p-username">Username</Label>
                  <Input
                    id="p-username"
                    placeholder="patient1"
                    value={patientUsername}
                    onChange={(e) => setPatientUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-password">Password</Label>
                  <Input
                    id="p-password"
                    type="password"
                    value={patientPassword}
                    onChange={(e) => setPatientPassword(e.target.value)}
                  />
                </div>
                <Button 
                  className="w-full h-11 text-base" 
                  onClick={() => handleLogin("patient")}
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Enter Patient Portal"}
                </Button>

                <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                  <p className="text-sm font-medium">First time here? Create Patient Account</p>
                  <div className="space-y-2">
                    <Label htmlFor="new-p-username">New Username</Label>
                    <Input
                      id="new-p-username"
                      placeholder="your_username"
                      value={newPatientUsername}
                      onChange={(e) => setNewPatientUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-p-password">New Password</Label>
                    <Input
                      id="new-p-password"
                      type="password"
                      value={newPatientPassword}
                      onChange={(e) => setNewPatientPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handlePatientSignup}
                    disabled={loading}
                  >
                    {loading ? "Creating..." : "Create Patient Account"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="therapist">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="t-username">Username</Label>
                  <Input
                    id="t-username"
                    placeholder="therapist1"
                    value={therapistUsername}
                    onChange={(e) => setTherapistUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-password">Password</Label>
                  <Input
                    id="t-password"
                    type="password"
                    value={therapistPassword}
                    onChange={(e) => setTherapistPassword(e.target.value)}
                  />
                </div>
                <Button 
                  className="w-full h-11 text-base" 
                  onClick={() => handleLogin("therapist")}
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Enter Therapist Portal"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-center border-t pt-6 bg-muted/10">
          <div className="text-center text-xs text-muted-foreground leading-5">
            <div>Demo accounts:</div>
            <div>Patient: patient1 / password</div>
            <div>Therapist: therapist1 / password</div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
