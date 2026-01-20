import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react"; // Adicionei ícones extras
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
  
  // Filtro simples visual
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

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir este produto?")) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) toast.error("Erro ao excluir produto");
      else {
        toast.success("Produto excluído!");
        loadProducts();
      }
    }
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

  // Filtragem local simples
  const filteredProducts = products.filter(p => 
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderContent = () => {
    if (loading) {
      return <div className="text-center py-10 text-muted-foreground animate-pulse">Carregando estoque...</div>;
    }

    if (products.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
          <div className="bg-muted/50 p-4 rounded-full">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-medium">Nenhum produto encontrado</p>
            <p className="text-sm text-muted-foreground">Comece adicionando itens ao seu catálogo.</p>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* VISÃO MOBILE (CARDS MODERNIZADOS) */}
        <div className="md:hidden grid gap-4">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white dark:bg-gray-900 border rounded-xl p-4 shadow-sm active:scale-[0.98] transition-transform">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{product.nome}</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground mt-1">
                    {product.categories?.nome || "Sem categoria"}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => handleEdit(product)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(product.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 py-3 border-t border-dashed">
                <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Custo</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">R$ {Number(product.custo).toFixed(2)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/10">
                  <p className="text-[10px] uppercase text-green-600/70 font-bold tracking-wider">Venda</p>
                  <p className="text-sm font-bold text-green-700 dark:text-green-400">R$ {Number(product.preco_venda).toFixed(2)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Estoque</p>
                  <p className="text-sm font-semibold">{product.quantidade}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* VISÃO DESKTOP (TABELA CLEAN) */}
        <div className="hidden md:block rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50/50 dark:bg-gray-900/50">
              <TableRow>
                <TableHead className="font-semibold text-gray-700 dark:text-gray-300">Nome do Produto</TableHead>
                <TableHead className="font-semibold text-gray-700 dark:text-gray-300">Categoria</TableHead>
                <TableHead className="text-right font-semibold text-gray-700 dark:text-gray-300">Custo</TableHead>
                <TableHead className="text-right font-semibold text-gray-700 dark:text-gray-300">Preço Venda</TableHead>
                <TableHead className="text-right font-semibold text-gray-700 dark:text-gray-300">Estoque</TableHead>
                <TableHead className="text-right font-semibold text-gray-700 dark:text-gray-300 w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">{product.nome}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                       {product.categories?.nome || "-"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    R$ {Number(product.custo).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-green-600">
                    R$ {Number(product.preco_venda).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${product.quantidade < 10 ? 'text-orange-500' : 'text-gray-600'}`}>
                      {product.quantidade}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                        onClick={() => handleEdit(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                        onClick={() => handleDelete(product.id)}
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
      {/* HEADER DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Produtos</h1>
          <p className="text-muted-foreground">Gerencie seu catálogo e controle de estoque.</p>
        </div>
        <div className="flex items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar produto..." 
                  className="pl-8 w-[200px] lg:w-[300px] bg-white dark:bg-gray-900"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
                <Button className="shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Produto
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
                    <DialogDescription>
                    Preencha as informações detalhadas do item abaixo.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                    <Label htmlFor="nome">Nome do Produto</Label>
                    <Input
                        id="nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="Ex: Coca-Cola 2L"
                        required
                    />
                    </div>
                    
                    <div className="space-y-2">
                    <Label htmlFor="categoria">Categoria</Label>
                    <Select value={categoriaId} onValueChange={setCategoriaId}>
                        <SelectTrigger>
                        <SelectValue placeholder="Selecione uma categoria..." />
                        </SelectTrigger>
                        <SelectContent>
                        {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                            {cat.nome}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="custo">Preço de Custo</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    id="custo"
                                    type="number"
                                    step="0.01"
                                    className="pl-9"
                                    value={custo}
                                    onChange={(e) => setCusto(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="preco">Preço de Venda</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">R$</span>
                                <Input
                                    id="preco"
                                    type="number"
                                    step="0.01"
                                    className="pl-9"
                                    value={precoVenda}
                                    onChange={(e) => setPrecoVenda(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="quantidade">Estoque Atual</Label>
                    <Input
                        id="quantidade"
                        type="number"
                        value={quantidade}
                        onChange={(e) => setQuantidade(e.target.value)}
                        required
                    />
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={resetForm}>
                    Cancelar
                    </Button>
                    <Button type="submit">
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
    </div>
  );
}