"use client";
import ManagementGate from '../../components/ManagementGate';
import PrivateWorkspace from '../../components/PrivateWorkspace';
export default function PrivateLibrary(){return <ManagementGate>{session=><PrivateWorkspace view="library" session={session}/>}</ManagementGate>;}
