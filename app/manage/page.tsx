"use client";
import OperationsShell from '../../components/OperationsShell';
import ManagementGate from '../../components/ManagementGate';
export default function Manage(){return <OperationsShell title="Your workspace." description="Private management uses an authenticated human session and separately provisioned workspace permissions."><ManagementGate>{session=><section className="opsPanel"><h2>Management access</h2><p>Role: {session.role}</p><p>Granted operations: {session.permissions?.join(', ')||'None'}</p><p>Open Library, Reviews, Health, or Updates to read current records. Approval and arming actions bind the displayed digest and current revision.</p></section>}</ManagementGate></OperationsShell>;}
