# Cone-Traced Supersampling com Suporte à Transparência Multi-Camada via $K$-Bitmasks

Repositório de pesquisa e desenvolvimento dedicado à extensão do algoritmo **Cone-Traced Supersampling (CTSS)** para renderização de transparência independente de ordem em superfícies implícitas (*Signed Distance Fields* - SDFs) em tempo real.

---

## Identificação Acadêmica

* **Instituição:** Instituto Federal do Norte de Minas Gerais (IFNMG) – Campus Montes Claros
* **Curso:** Bacharelado em Ciência da Computação
* **Disciplina:** Computação Gráfica
* **Professor:** Prof. Wagner Ferreira de Barros
* **Equipe de Discentes:**
  * André Felipe de Oliveira Lopes
  * Rafael José Braga Coelho

---

## Sobre o Projeto

Os **Campos de Distância com Sinal (SDFs)** são funções matemáticas contínuas usadas para representar objetos 3D com resolução infinita diretamente na placa de vídeo (GPU). No entanto, o método tradicional de visualização (*sphere tracing*) costuma produzir fortes serrilhamentos nas bordas dos objetos.

O algoritmo **Cone-Traced Supersampling (CTSS)**, proposto por Chubarau et al. (2024), resolveu esse problema com alta eficiência ao modelar o feixe do pixel como um cone e utilizar uma máscara analítica de 32 bits ($6 \times 6$ subpixels) para suavizar as bordas. Contudo, a técnica original foi projetada exclusivamente para materiais sólidos e opacos: tão logo o raio encosta em uma superfície, a marcha é interrompida, fazendo com que vidros e materiais translúcidos bloqueiem completamente o que está atrás.

### Nossa Proposta
Este trabalho estende o CTSS para suportar **múltiplas camadas de objetos transparentes sobrepostos**:
1. **Salto de Raio e Descarte Dinâmico:** Ao atingir uma casca transparente, o feixe cônico registra as informações da camada e salta para a frente sem ficar preso, desconsiderando a geometria já penetrada nas iterações seguintes.
2. **Arranjo de $K$-Bitmasks:** Substitui a máscara binária única por um conjunto de $K$ máscaras discretas, quantizando a transmitância e acumulando a cor do vidro e dos objetos de fundo proporcionalmente aos subpixels visíveis.

---

## Resultados Visuais

### 1. Comparação Direta: Baseline vs. Proposta com $K$-Bitmasks
Na *baseline* original, o vidro âmbar atua como um bloco sólido e oculta a esfera e o pilar. Com a proposta ativa, os objetos de trás tornam-se visíveis com correta mistura de cor e preservação das silhuetas curvas suaves:

| Baseline (CTSS Original - Bloqueio Opaco) | Proposta (Transparência Ativa com $K$-Bitmasks) |
| :---: | :---: |
| ![Baseline](images/transparency-no-applied.png) | ![Proposta](images/transparency-applied.png) |

---

### 2. Cenas Sintéticas de Teste Multi-Camada
Validação do algoritmo com sobreposição sucessiva de 2 e 3 volumes translúcidos alinhados (painéis e esferas de vidro):

| Teste com 2 Camadas | Teste de Estresse com 3 Camadas Alinhadas |
| :---: | :---: |
| ![2 Camadas](images/transparency-2-layers.png) | ![3 Camadas](images/transparency-3-layers.png) |

---

### 3. Anti-Serrilhamento Geométrico do CTSS
Comparação entre o *Sphere Tracing* tradicional pontual (sem anti-aliasing) e a suavização analítica proporcionada pelo feixe cônico do CTSS:

| Sem Anti-Aliasing (Sphere Tracing Puro) | Com Anti-Aliasing Analítico (CTSS) |
| :---: | :---: |
| ![Sem AA](images/CTSS-no-applied.png) | ![Com CTSS](images/CTSS-applied.png) |

---

## Como Executar o Projeto

### Pré-requisitos
* **Unity 2022.3 LTS** (ou superior) com suporte a *DirectX 11*, *OpenGL 4.5* ou *Vulkan*.

### Passos
1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/cone-traced-supersampling.git
   ```
2. Abra a pasta do projeto no **Unity Hub**.
3. No painel *Project*, navegue até a pasta `Assets/scenes/` (ou abra diretamente a cena principal `CTSS_transparency_row.unity`).
4. Pressione o botão **Play** no Unity.

### Controles Interativos (Interface e Teclado)
O script de controle (`Controller.cs`) fornece um painel na tela e os seguintes atalhos:
* **`T`**: Ativa/Desativa a transparência com $K$-bitmasks em tempo real;
* **`1` a `6`**: Alterna entre as cenas disponíveis (Primitivas, Sponza, Transparência Base, 2 Camadas e Fileira de 3 Camadas);
* **`7`, `8`, `9`**: Alterna a visibilidade individual dos vidros 1 (Âmbar), 2 (Ciano) e 3 (Magenta);
* **`0`**: Liga/Desliga todos os vidros simultaneamente;
* **Setas do Teclado / Mouse:** Movimentam a câmera de visualização (segure `Shift` para velocidade rápida).

---

## Referência Base

* CHUBARAU, Andrei et al. **Cone-Traced Supersampling with Subpixel Edge Reconstruction**. *IEEE Transactions on Visualization and Computer Graphics*, v. 30, n. 5, p. 1-12, 2024. DOI: [10.1109/TVCG.2023.3343166](https://doi.org/10.1109/TVCG.2023.3343166).
