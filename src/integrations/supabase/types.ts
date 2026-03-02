export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
   Tables: {
      caixas: {
        Row: {
          id: string
          data_abertura: string
          data_fechamento: string | null
          valor_abertura: number
          valor_fechamento: number | null
          colaborador_id: string
          status: Database["public"]["Enums"]["caixa_status"]
        }
        Insert: {
          id?: string
          data_abertura?: string
          data_fechamento?: string | null
          valor_abertura: number
          valor_fechamento?: number | null
          colaborador_id: string
          status?: Database["public"]["Enums"]["caixa_status"]
        }
        Update: {
          id?: string
          data_abertura?: string
          data_fechamento?: string | null
          valor_abertura?: number
          valor_fechamento?: number | null
          colaborador_id?: string
          status?: Database["public"]["Enums"]["caixa_status"]
        }
        Relationships: [
          {
            foreignKeyName: "caixas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      categories: {
        Row: { created_at: string; id: string; nome: string }
        Insert: { created_at?: string; id?: string; nome: string }
        Update: { created_at?: string; id?: string; nome?: string }
        Relationships: []
      }
      movements: {
        Row: {
          created_at: string
          descricao: string
          id: string
          responsavel_id: string
          tipo: Database["public"]["Enums"]["movement_type"]
          valor: number
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          responsavel_id: string
          tipo: Database["public"]["Enums"]["movement_type"]
          valor: number
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          responsavel_id?: string
          tipo?: Database["public"]["Enums"]["movement_type"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movements_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          categoria_id: string | null
          created_at: string
          custo: number
          id: string
          nome: string
          preco_venda: number
          quantidade: number
          updated_at: string
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string
          custo: number
          id?: string
          nome: string
          preco_venda: number
          quantidade?: number
          updated_at?: string
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          custo?: number
          id?: string
          nome?: string
          preco_venda?: number
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["user_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          nome: string
          tipo?: Database["public"]["Enums"]["user_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["user_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
          venda_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          subtotal?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          id: string
          venda_id: string
          metodo_pagamento: Database["public"]["Enums"]["payment_method"]
          valor: number
          created_at: string
        }
        Insert: {
          id?: string
          venda_id: string
          metodo_pagamento: Database["public"]["Enums"]["payment_method"]
          valor: number
          created_at?: string
        }
        Update: {
          id?: string
          venda_id?: string
          metodo_pagamento?: Database["public"]["Enums"]["payment_method"]
          valor?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          }
        ]
      }
      sales: {
        Row: {
          colaborador_id: string
          caixa_id: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["sale_status"]
          total: number
          updated_at: string
          nome_cliente: string | null
          numero_comanda: string | null
          metodo_pagamento: Database["public"]["Enums"]["payment_method"] | null
        }
        Insert: {
          colaborador_id: string
          caixa_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["sale_status"]
          total?: number
          updated_at?: string
          nome_cliente?: string | null
          numero_comanda?: string | null
          metodo_pagamento?: Database["public"]["Enums"]["payment_method"] | null
        }
        Update: {
          colaborador_id?: string
          caixa_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["sale_status"]
          total?: number
          updated_at?: string
          nome_cliente?: string | null
          numero_comanda?: string | null
          metodo_pagamento?: Database["public"]["Enums"]["payment_method"] | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "caixas"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      movement_type: "entrada" | "saida"
      sale_status: "aberta" | "finalizada"
      user_type: "admin" | "colaborador"
      payment_method: "dinheiro" | "pix" | "cartao_credito" | "cartao_debito"
      caixa_status: "aberto" | "fechado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R } ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R } ? R : never : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I } ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I } ? I : never : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U } ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U } ? U : never : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"] : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName] : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never

export const Constants = {
  public: {
    Enums: {
      movement_type: ["entrada", "saida"],
      sale_status: ["aberta", "finalizada"],
      user_type: ["admin", "colaborador"],
    },
  },
} as const