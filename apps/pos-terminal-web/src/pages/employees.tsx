import { useLocation } from "wouter";
import { Plus, Key, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/design";

interface Employee {
  id: number;
  name: string;
  role: string;
  status: "active" | "inactive";
}

const MOCK_EMPLOYEES: Employee[] = [
  { id: 1, name: "Andi Saputra", role: "Manager", status: "active" },
  { id: 2, name: "Siti Aminah", role: "Kasir", status: "active" },
  { id: 3, name: "Budi Santoso", role: "Waiter", status: "inactive" },
];

export default function EmployeesPage() {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    setLocation("/hub");
  };

  const handleAddNew = () => {
  };

  const handleManageAccess = (employeeId: number) => {
  };

  const handleDelete = (employeeId: number) => {
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in slide-in-from-bottom-4">
      <PageHeader
        title="Karyawan"
        subtitle="Manajemen akun dan akses staf"
        onBack={handleBack}
        actions={
          <button
            onClick={handleAddNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors"
            data-testid="button-add-employee"
          >
            <Plus size={16} /> Baru
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3">
          {MOCK_EMPLOYEES.map((emp) => (
            <div
              key={emp.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-blue-300 transition-all cursor-pointer group"
              data-testid={`card-employee-${emp.id}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-lg border border-slate-200"
                  data-testid={`avatar-employee-${emp.id}`}
                >
                  {emp.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800" data-testid={`text-employee-name-${emp.id}`}>
                    {emp.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-[10px] bg-slate-100 px-2 py-0.5 rounded uppercase font-bold text-slate-500"
                      data-testid={`badge-employee-role-${emp.id}`}
                    >
                      {emp.role}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        emp.status === "active" ? "bg-green-500" : "bg-slate-300"
                      }`}
                      data-testid={`status-employee-${emp.id}`}
                    ></span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleManageAccess(emp.id);
                  }}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  data-testid={`button-manage-access-${emp.id}`}
                  aria-label="Kelola Akses"
                >
                  <Key size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(emp.id);
                  }}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  data-testid={`button-delete-${emp.id}`}
                  aria-label="Hapus"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
