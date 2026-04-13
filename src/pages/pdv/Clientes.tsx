import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Users, AlertTriangle } from "lucide-react"; 

interface Client {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
}

export default function Clientes() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('clients').select('*').order('nome');
    if (error) toast.error("Erro ao carregar clientes", { description: error.message });
    else setClients(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientData = { nome, telefone: telefone || null, cpf: cpf || null };

    if (editingClient) {
      const { error } = await supabase.from('clients').update(clientData).eq('id', editingClient.id);
      if (error) toast.error("Erro ao atualizar cliente");
      else { toast.success("Cliente atualizado!"); resetForm(); loadClients(); }
    } else {
      const { error } = await supabase.from('clients').insert([clientData]);
      if (error) toast.error("Erro ao adicionar cliente");
      else { toast.success("Cliente adicionado!"); resetForm(); loadClients(); }
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setNome(client.nome);
    setTelefone(client.telefone || "");
    setCpf(client.cpf || "");
    setIsOpen(true);
  };

  const promptDelete = (client: Client) => { setClientToDelete(client); setIsDeleteModalOpen(true); };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    const { error } = await supabase.from('clients').delete().eq('id', clientToDelete.id);
    if (error) toast.error("Erro ao excluir. Verifique se o cliente tem dívidas.");
    else { toast.success("Cliente excluído com sucesso!"); loadClients(); }
    setIsDeleteModalOpen(false); setClientToDelete(null);
  };

  const resetForm = () => { setNome(""); setTelefone(""); setCpf(""); setEditingClient(null); setIsOpen(false); };

  const filteredClients = clients.filter(c => c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || (c.cpf && c.cpf.includes(searchTerm)));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Clientes</h1>
          <p className="text-muted-foreground">Registe os seus clientes para usar o sistema de fiado/crediário.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar cliente..." className="pl-8 w-full sm:w-[300px] bg-background border-border text-foreground" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>

            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
                <Button className="shadow-sm w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-card border-border">
                <form onSubmit={handleSubmit}>
                <DialogHeader><DialogTitle className="text-foreground">{editingClient ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="nome">Nome Completo</Label>
                        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="telefone">Telefone (Opcional)</Label>
                        <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cpf">CPF (Opcional)</Label>
                        <Input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                    <Button type="submit">{editingClient ? "Salvar" : "Cadastrar"}</Button>
                </DialogFooter>
                </form>
            </DialogContent>
            </Dialog>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? ( <div className="text-center py-10 text-muted-foreground">A carregar...</div> ) : filteredClients.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
               <Users className="h-10 w-10 text-muted-foreground opacity-50" />
               <p className="text-muted-foreground">Nenhum cliente encontrado.</p>
             </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 border-border">
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{client.nome}</TableCell>
                    <TableCell>{client.telefone || "-"}</TableCell>
                    <TableCell>{client.cpf || "-"}</TableCell>
                    <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleEdit(client)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => promptDelete(client)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Excluir Cliente?</AlertDialogTitle>
            <AlertDialogDescription>Deseja remover <strong>{clientToDelete?.nome}</strong>? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-white">Sim, Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}