import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PlateCalculatorModal,
  type PlateCalculatorModalProps,
} from "@/components/athlete/plate-calculator-modal";

const renderModal = (props: PlateCalculatorModalProps) =>
  renderToStaticMarkup(createElement(PlateCalculatorModal, props));
const toText = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("PlateCalculatorModal (GH #184 / GOZS-178)", () => {
  it("no renderiza nada cuando isOpen es false", () => {
    const html = renderModal({
      isOpen: false,
      onClose: () => {},
      targetWeightKg: 70,
    });
    expect(html).toBe("");
  });

  it("renderiza modal con barra olímpica estándar (20 kg) por defecto y calcula discos por lado", () => {
    const html = renderModal({
      isOpen: true,
      onClose: () => {},
      targetWeightKg: 70,
    });

    expect(html).toContain('data-testid="plate-calculator-modal"');
    expect(html).toContain('data-testid="barbell-btn-20"');
    expect(html).toContain('data-testid="barbell-btn-15"');
    expect(html).toContain('data-testid="barbell-btn-10"');

    const text = toText(html);
    expect(text).toContain("Calculadora de Discos");
    expect(text).toContain("Olímpica estándar (20 kg)");
    // 70 kg total - 20 kg barra = 50 kg / 2 = 25 kg por lado
    expect(text).toContain("25 kg");
    expect(text).toContain("Barra: 20 kg + 50 kg en discos = 70 kg total");
    expect(text).toContain("Disco de 25 kg");
    expect(text).toContain("× 1 por lado (2 en total)");
    expect(text).toContain("Peso real normalizado: 70 kg");
  });

  it("renderiza y calcula correctamente con barra corta de 10 kg", () => {
    // 70 kg total con barra de 10 kg -> (70 - 10) / 2 = 30 kg por lado (25 kg + 5 kg)
    const html = renderModal({
      isOpen: true,
      onClose: () => {},
      targetWeightKg: 70,
      initialBarWeightKg: 10,
    });

    const text = toText(html);
    expect(text).toContain("Barra corta / Estándar común (10 kg)");
    expect(text).toContain("30 kg");
    expect(text).toContain("Barra: 10 kg + 60 kg en discos = 70 kg total");
    expect(text).toContain("Disco de 25 kg");
    expect(text).toContain("Disco de 5 kg");
    expect(text).toContain("Peso real normalizado: 70 kg");
  });

  it("renderiza y calcula correctamente con barra semi-olímpica de 15 kg", () => {
    // 70 kg total con barra de 15 kg -> (70 - 15) / 2 = 27.5 kg por lado (25 kg + 2.5 kg)
    const html = renderModal({
      isOpen: true,
      onClose: () => {},
      targetWeightKg: 70,
      initialBarWeightKg: 15,
    });

    const text = toText(html);
    expect(text).toContain("Semi-olímpica / Femenina (15 kg)");
    expect(text).toContain("27.5 kg");
    expect(text).toContain("Barra: 15 kg + 55 kg en discos = 70 kg total");
    expect(text).toContain("Disco de 25 kg");
    expect(text).toContain("Disco de 2.5 kg");
    expect(text).toContain("Peso real normalizado: 70 kg");
  });

  it("muestra estado vacío cuando el peso total equivale exactamente al peso de la barra", () => {
    const html = renderModal({
      isOpen: true,
      onClose: () => {},
      targetWeightKg: 20,
      initialBarWeightKg: 20,
    });

    expect(html).toContain('data-testid="empty-plates-notice"');
    const text = toText(html);
    expect(text).toContain("0 kg");
    expect(text).toContain("Solo la olímpica estándar (20 kg) (sin discos adicionales)");
  });

  it("incluye botón para transferir peso a la serie cuando onApplyWeight está provisto", () => {
    const onApply = vi.fn();
    const html = renderModal({
      isOpen: true,
      onClose: () => {},
      targetWeightKg: 85,
      onApplyWeight: onApply,
    });

    expect(html).toContain('data-testid="transferir-peso-btn"');
    const text = toText(html);
    expect(text).toContain("Transferir 85 kg a la serie");
  });

  it("incluye badge visible de normalización de peso y protección de PR", () => {
    const html = renderModal({
      isOpen: true,
      onClose: () => {},
      targetWeightKg: 100,
    });

    expect(html).toContain('data-testid="pr-normalization-badge"');
    const text = toText(html);
    expect(text).toContain("Peso real normalizado: 100 kg (protege PRs y tonelaje)");
  });
});
