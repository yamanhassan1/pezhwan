import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import UserForm, { type UserFormValues } from '../../components/Forms/UserForm';
import { apiGet, apiPatch } from '../../lib/api';
import { toast } from '../../components/Layout/Layout';
import type { User } from '../../types';

export default function UsersEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    apiGet<{ user: User }>(`/v1/admin/users/${id}`)
      .then((res) => {
        setUser(res.user);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [id]);

  const handleSave = async (values: UserFormValues) => {
    if (!id) return;
    const body: Record<string, unknown> = {
      email: values.email,
      phone: values.phone,
      isActive: values.isActive,
      roles: values.roles,
    };
    if (values.password.trim()) body.password = values.password;
    await apiPatch(`/v1/admin/users/${id}`, body);
    toast.success('User updated');
    navigate(`/users/${id}`);
  };

  if (loading) return <div className="card">Loading user...</div>;

  if (error || !user) {
    return (
      <div className="card">
        <div className="toast toast-error">{error ?? 'User not found'}</div>
        <Link to="/users" className="btn btn-ghost" style={{ marginTop: 12 }}>
          Back to users
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Edit User</h1>
      </div>
      <div style={{ maxWidth: 520 }}>
        <UserForm
          initial={{
            email: user.email ?? '',
            phone: user.phone ?? '',
            roles: user.roles,
            isActive: user.isActive,
          }}
          onSave={handleSave}
          saveLabel="Save changes"
          showPassword
          passwordRequired={false}
        />
      </div>
    </div>
  );
}
