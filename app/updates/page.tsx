"use client";
import ManagementGate from '../../components/ManagementGate';
import PrivateWorkspace from '../../components/PrivateWorkspace';
import OperationsShell from '../../components/OperationsShell';
import policy from '../../config/operating-policy.json';
export default function Updates(){return <OperationsShell title="Controlled delivery." description="Metadata, skill instructions, application releases, and local clients follow distinct update rules."><p className="notice">Source default: <strong>{policy.updates.defaultMode}</strong>. Deployed policy and activation are unknown until authenticated records are loaded.</p><ManagementGate>{session=><PrivateWorkspace view="updates" session={session}/>}</ManagementGate></OperationsShell>;}
