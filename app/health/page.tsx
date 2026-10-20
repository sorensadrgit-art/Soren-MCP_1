"use client";
import ManagementGate from '../../components/ManagementGate';
import PrivateWorkspace from '../../components/PrivateWorkspace';
import PublicHealth from '../../components/PublicHealth';
import OperationsShell from '../../components/OperationsShell';
export default function Health(){return <OperationsShell title="Observe each component." description="Liveness, readiness, provider status, scheduler delivery, and desktop invocation are separate observations."><PublicHealth/><ManagementGate>{session=><PrivateWorkspace view="health" session={session}/>}</ManagementGate></OperationsShell>;}
