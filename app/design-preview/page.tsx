"use client"

// TEMPORARY — preview kept for reference
// Issue #3 — Login + Dashboards — Version 5 (final)

import Image from "next/image"
import { Button } from "@/components/book-it/button"
import { InputField } from "@/components/book-it/input-field"
import { Card } from "@/components/book-it/card"
import { CalendarDays, Building2, Users, BarChart2, ChevronRight } from "lucide-react"

function ScreenFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-sm min-h-[640px] bg-white">
        {children}
      </div>
    </div>
  )
}

export default function DesignPreview() {
  return (
    <div className="min-h-screen bg-neutral-50 py-10 px-4">
      <div className="max-w-4xl mx-auto mb-10">
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Design Preview — Version finale</p>
        <h1 className="text-xl font-semibold text-neutral-900 mt-0.5">Issue #3 — Login + Dashboards</h1>
        <p className="text-sm text-neutral-500 mt-1">Flow complet : Login → Dashboard owner → Dashboard prestataire.</p>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ScreenFrame label="Login">
            <LoginV5 />
          </ScreenFrame>
          <ScreenFrame label="Dashboard owner">
            <OwnerV5 />
          </ScreenFrame>
          <ScreenFrame label="Dashboard prestataire">
            <ProviderV5 />
          </ScreenFrame>
        </div>
      </div>
    </div>
  )
}

function LoginV5() {
  return (
    <div className="flex flex-col justify-center min-h-[640px] px-6 bg-white">
      <div className="mb-10 flex items-center gap-3">
        <Image src="/logo-transparent.png" alt="Book_it" width={40} height={40} className="rounded-sm" />
        <p className="text-xl font-semibold text-neutral-900">
          Book<span className="text-primary">_it</span>
        </p>
      </div>
      <div className="flex flex-col gap-5">
        <InputField label="E-mail" type="email" placeholder="philippe@example.com" />
        <InputField label="Mot de passe" type="password" placeholder="••••••••" />
        <Button className="w-full">Se connecter</Button>
      </div>
    </div>
  )
}

function OwnerV5() {
  return (
    <div className="min-h-[640px] bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          <Image src="/logo-transparent.png" alt="Book_it" width={32} height={32} className="rounded-sm" />
          <p className="text-sm font-semibold text-neutral-900">Book<span className="text-primary">_it</span></p>
        </div>
        <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">P</span>
        </div>
      </div>
      {/* Greeting */}
      <div className="px-4 py-5">
        <p className="text-xs text-neutral-500">Bonjour,</p>
        <h1 className="text-xl font-semibold text-neutral-900">Philippe</h1>
      </div>
      {/* 4 nav cards */}
      <div className="px-4 flex flex-col gap-3">
        <Card className="cursor-pointer">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-light flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold text-neutral-900">Réservations</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-500" />
          </div>
        </Card>
        <Card className="cursor-pointer">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-light flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold text-neutral-900">Propriétés</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-500" />
          </div>
        </Card>
        <Card className="cursor-pointer">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-light flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold text-neutral-900">Prestataires</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-500" />
          </div>
        </Card>
        <Card className="cursor-pointer">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-light flex items-center justify-center">
                <BarChart2 className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold text-neutral-900">Synthèse</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-500" />
          </div>
        </Card>
      </div>
    </div>
  )
}

function ProviderV5() {
  return (
    <div className="min-h-[640px] bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2.5">
          <Image src="/logo-transparent.png" alt="Book_it" width={32} height={32} className="rounded-sm" />
          <p className="text-sm font-semibold text-neutral-900">Book<span className="text-primary">_it</span></p>
        </div>
        <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">A</span>
        </div>
      </div>
      {/* Greeting */}
      <div className="px-4 py-5">
        <p className="text-xs text-neutral-500">Bonjour,</p>
        <h1 className="text-xl font-semibold text-neutral-900">Anne-So</h1>
      </div>
      {/* 1 nav card */}
      <div className="px-4">
        <Card className="cursor-pointer">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary-light flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold text-neutral-900">Réservations</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-500" />
          </div>
        </Card>
      </div>
    </div>
  )
}
