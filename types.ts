
export enum CustomerStatus {
  ACTIVE = 'ativo',
  INACTIVE = 'inativo',
  PENDING = 'pendente'
}

export interface Customer {
  id: string;
  empresa_id: string; // FK para isolamento multi-empresa
  name: string;
  phone: string;
  email: string;
  registration_date: string;
  status: CustomerStatus;
  observations: string;
  is_deleted: boolean;
  created_at: string;
  created_by: string; // User ID do responsável
}

export interface UserProfile {
  id: string;
  email: string;
  company_name: string;
  responsible_name: string;
  accepted_terms: boolean;
  created_at: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  profile: UserProfile | null;
  loading: boolean;
}

export interface AppStats {
  total: number;
  active: number;
  inactive: number;
}
