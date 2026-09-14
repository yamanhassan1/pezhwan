import { useNavigate } from 'react-router-dom';
import TenantForm, { type TenantFormValues } from '../../components/Forms/TenantForm';
import { apiPost } from '../../lib/api';
import { toast } from '../../components/Layout/Layout';

export default function TenantsCreate() {
  const navigate = useNavigate();

  const handleSave = async (values: TenantFormValues) => {
    const body: Record<string, unknown> = {
      name: values.name,
      plan: values.plan,
      isActive: values.isActive,
    };
    if (values.slug.trim()) body.slug = values.slug.trim();
    if (values.config.trim()) body.config = JSON.parse(values.config);
    const res = await apiPost<{ tenants?: unknown }>('/v1/admin/tenants', body);
    void res;
    toast.success('Tenant created');
    navigate('/tenants');
  };

  return (
    <div>
      <div className="page-header">
        <h1>Create Tenant</h1>
      </div>
      <TenantForm onSave={handleSave} saveLabel="Create tenant" />
    </div>
  );
}
