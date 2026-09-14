import { useNavigate } from 'react-router-dom';
import UserForm, { type UserFormValues } from '../../components/Forms/UserForm';
import { apiPost } from '../../lib/api';
import { toast } from '../../components/Layout/Layout';

export default function UsersCreate() {
  const navigate = useNavigate();

  const handleSave = async (values: UserFormValues) => {
    await apiPost('/v1/admin/users', {
      email: values.email,
      phone: values.phone,
      password: values.password,
      roles: values.roles,
      isActive: values.isActive,
    });
    toast.success('User created');
    navigate('/users');
  };

  return (
    <div>
      <div className="page-header">
        <h1>Create User</h1>
      </div>
      <div style={{ maxWidth: 520 }}>
        <UserForm onSave={handleSave} saveLabel="Create user" passwordRequired />
      </div>
    </div>
  );
}
