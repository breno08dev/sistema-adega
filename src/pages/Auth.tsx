import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, Mail, LogIn, Loader2 } from "lucide-react";
// 1. Importar o useAuth do seu contexto
import { useAuth } from "@/contexts/AuthContext";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // 2. Extrair a função signIn do contexto em vez de usar o Supabase direto
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 3. Usar a função signIn do AuthContext. 
      // É ela quem vai descobrir o cargo (userType) e fazer o navigate correto!
      const { error } = await signIn(email, password);
      
      if (error) throw error;
      
      toast.success("Sessão iniciada com sucesso!");
      // Removemos o navigate("/") daqui, pois o signIn já faz o navigate("/admin") ou ("/pdv")
      
    } catch (error: any) {
      toast.error(error.message === "Invalid login credentials" ? "Credenciais inválidas" : "Erro ao iniciar sessão");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Efeito de luz no fundo para dar um toque super Premium */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-700 relative z-10">
        <div className="flex flex-col items-center mb-8">
          {/* LOGO DA EMPRESA */}
          <img 
            src="/conectnew.logo.png" 
            alt="Logo Conect New" 
            className="h-40 w-auto object-contain mb-4 drop-shadow-xl transform hover:scale-105 transition-transform duration-300"
          />
          <p className="text-muted-foreground mt-2 font-medium text-center">Acesso restrito a colaboradores</p>
        </div>

        <Card className="bg-card/80 backdrop-blur-xl border-border shadow-2xl">
          <form onSubmit={handleLogin}>
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold text-center text-foreground">Iniciar Sessão</CardTitle>
              <CardDescription className="text-center text-muted-foreground">
                Insira as suas credenciais para aceder ao sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground font-semibold">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@adega.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-11 bg-background/50 border-border text-foreground h-12 text-base focus:bg-background transition-colors"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground font-semibold">Palavra-passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 bg-background/50 border-border text-foreground h-12 text-base focus:bg-background transition-colors"
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-4 pb-8">
              <Button
                type="submit"
                className="w-full h-14 text-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> A ENTRAR...</>
                ) : (
                  <><LogIn className="mr-2 h-5 w-5" /> ENTRAR</>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}