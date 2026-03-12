import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Package, AlertTriangle } from "lucide-react"; 
import { Database } from "@/integrations/supabase/types";

// --- TIPOS ---
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];

type Product = ProductRow & {
  categories: { nome: string } | null;
};

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Estado para o Modal de Exclusão
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");

  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [custo, setCusto] = useState("");
  const [quantidade, setQuantidade] = useState("");

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(nome)')
      .order('nome');
    
    if (error) {
      toast.error("Erro ao carregar produtos", { description: error.message });
    } else if (data) {
      setProducts(data as Product[]); 
    }
    setLoading(false);
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('nome');
    
    if (error) {
       toast.error("Erro ao carregar categorias", { description: error.message });
    } else if (data) {
       setCategories(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const productData = {
      nome,
      categoria_id: categoriaId || null,
      preco_venda: parseFloat(precoVenda),
      custo: parseFloat(custo),
      quantidade: parseInt(quantidade),
    };

    if (editingProduct) {
      const { error } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
      if (error) toast.error("Erro ao atualizar produto");
      else {
        toast.success("Produto atualizado!");
        resetForm();
        loadProducts();
      }
    } else {
      const { error } = await supabase.from('products').insert([productData]);
      if (error) toast.error("Erro ao adicionar produto");
      else {
        toast.success("Produto adicionado!");
        resetForm();
        loadProducts();
      }
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setNome(product.nome);
    setCategoriaId(product.categoria_id || "");
    setPrecoVenda(product.preco_venda.toString());
    setCusto(product.custo.toString());
    setQuantidade(product.quantidade.toString());
    setIsOpen(true);
  };

  // Prepara a exclusão abrindo o modal Premium
  const promptDelete = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  // Executa a exclusão de fato
  const confirmDelete = async () => {
    if (!productToDelete) return;
    
    const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
    if (error) {
        toast.error("Erro ao excluir produto");
    } else {
        toast.success("Produto excluído com sucesso!");
        loadProducts();
    }
    setIsDeleteModalOpen(false);
    setProductToDelete(null);
  };

  const resetForm = () => {
    setNome("");
    setCategoriaId("");
    setPrecoVenda("");
    setCusto("");
    setQuantidade("");
    setEditingProduct(null);
    setIsOpen(false);
  };

  const filteredProducts = products.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderContent = () => {
    if (loading) {
      return <div className="text-center py-10 text-muted-foreground animate-pulse">A carregar estoque...</div>;
    }

    if (products.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
          <div className="bg-muted/50 p-4 rounded-full">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">Nenhum produto encontrado</p>
            <p className="text-sm text-muted-foreground">Comece por adicionar itens ao seu catálogo.</p>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* VISÃO MOBILE */}
        <div className="md:hidden grid gap-4">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-card border border-border rounded-xl p-4 shadow-sm active:scale-[0.98] transition-transform">
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col">
                  <h3 className="font-semibold text-foreground">{product.nome}</h3>
                  <span className="inline-flex w-fit items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground mt-1">
                    {product.categories?.nome || "Sem categoria"}
                  </span>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10" onClick={() => handleEdit(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => promptDelete(product)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 py-3 border-t border-dashed border-border mt-2">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Custo</p>
                  <p className="text-sm font-semibold text-foreground">R$ {Number(product.custo).toFixed(2)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-primary/10">
                  <p className="text-[10px] uppercase text-primary font-bold tracking-wider">Venda</p>
                  <p className="text-sm font-bold text-primary">R$ {Number(product.preco_venda).toFixed(2)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Estoque</p>
                  <p className="text-sm font-semibold text-foreground">{product.quantidade}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* VISÃO DESKTOP */}
        <div className="hidden md:block rounded-md border border-border overflow-hidden bg-card">
          <Table>
            <TableHeader className="bg-muted/50 border-border">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-semibold text-muted-foreground">Nome do Produto</TableHead>
                <TableHead className="font-semibold text-muted-foreground">Categoria</TableHead>
                <TableHead className="text-right font-semibold text-muted-foreground">Custo</TableHead>
                <TableHead className="text-right font-semibold text-muted-foreground">Preço Venda</TableHead>
                <TableHead className="text-right font-semibold text-muted-foreground">Estoque</TableHead>
                <TableHead className="text-right font-semibold text-muted-foreground w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id} className="hover:bg-muted/30 transition-colors border-border">
                  <TableCell className="font-medium text-foreground">{product.nome}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                       {product.categories?.nome || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    R$ {Number(product.custo).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-foreground">
                    R$ {Number(product.preco_venda).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${product.quantidade < 10 ? 'text-destructive' : 'text-foreground'}`}>
                      {product.quantidade}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={() => handleEdit(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => promptDelete(product)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Produtos</h1>
          <p className="text-muted-foreground">Gerencie o seu catálogo e controlo de estoque.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar produto..." 
                  className="pl-8 w-full sm:w-[200px] lg:w-[300px] bg-background border-border text-foreground"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
                <Button className="shadow-sm w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" />
                Novo Produto
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-card border-border">
                <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle className="text-foreground">{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                    Preencha as informações detalhadas do item abaixo.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                    <Label htmlFor="nome" className="text-foreground">Nome do Produto</Label>
                    <Input
                        id="nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Ex: Coca-Cola 2L"
                        className="bg-background border-border text-foreground"
                        required
                    />
                    </div>
                    
                    <div className="space-y-2">
                    <Label htmlFor="categoria" className="text-foreground">Categoria</Label>
                    <Select value={categoriaId} onValueChange={setCategoriaId}>
                        <SelectTrigger className="bg-background border-border text-foreground">
                        <SelectValue placeholder="Selecione uma categoria..." />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                        {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id} className="text-foreground focus:bg-muted">
                            {cat.nome}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="custo" className="text-foreground">Preço de Custo</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    id="custo"
                                    type="number"
                                    step="0.01"
                                    className="pl-9 bg-background border-border text-foreground"
                                    value={custo}
                                    onChange={(e) => setCusto(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="preco" className="text-foreground">Preço de Venda</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    id="preco"
                                    type="number"
                                    step="0.01"
                                    className="pl-9 bg-background border-border text-foreground"
                                    value={precoVenda}
                                    onChange={(e) => setPrecoVenda(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="quantidade" className="text-foreground">Estoque Atual</Label>
                    <Input
                        id="quantidade"
                        type="number"
                        value={quantidade}
                        onChange={(e) => setQuantidade(e.target.value)}
                        className="bg-background border-border text-foreground"
                        required
                    />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0 border-t border-border pt-4">
                    <Button type="button" variant="outline" className="bg-background border-border text-foreground hover:bg-muted" onClick={resetForm}>
                    Cancelar
                    </Button>
                    <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                    {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
                    </Button>
                </DialogFooter>
                </form>
            </DialogContent>
            </Dialog>
        </div>
      </div>

      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="p-0">
          {renderContent()}
        </CardContent>
      </Card>

      {/* NOVO MODAL PREMIUM DE EXCLUSÃO */}
      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Excluir Produto?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem a certeza de que deseja remover <strong className="text-foreground">{productToDelete?.nome}</strong> do catálogo? Esta ação não pode ser desfeita e pode afetar o histórico de vendas antigas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-background text-foreground border-border hover:bg-muted">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Sim, Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}